#!/usr/bin/env python3
"""AWS SSM-only updater for the YoruBay relay model allowlist.

Runs as root on the relay. Only manages a dedicated systemd drop-in and
its one-variable EnvironmentFile; it never edits existing service secrets.
"""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

UNIT = "bao-backend.service"
DIRECTORY = Path("/etc/systemd/system/bao-backend.service.d")
DROPIN = DIRECTORY / "95-yorubay-model-registry.conf"
ENVFILE = DIRECTORY / "95-yorubay-model-registry.env"
SNAPSHOT = DIRECTORY / ".yorubay-model-registry-rollback.json"
LOCK = Path("/run/lock/yorubay-model-registry.lock")
DROPIN_CONTENT = "[Service]\nEnvironmentFile=" + str(ENVFILE) + "\n"
MODEL = re.compile(r"^[a-z0-9][a-z0-9._:-]*/[a-z0-9][a-z0-9._:-]*$")
HASH = re.compile(r"^[a-f0-9]{64}$")


def sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=40).stdout.strip()


def live():
    pid = run("systemctl", "show", UNIT, "-p", "MainPID", "--value")
    if not pid.isdigit() or int(pid) <= 0:
        raise RuntimeError("relay systemd service has no running PID")
    values = Path("/proc") / pid / "environ"
    matches = [v.split(b"=", 1)[1] for v in values.read_bytes().split(b"\x00")
               if v.startswith(b"OPENROUTER_MODELS=")]
    if len(matches) != 1:
        raise RuntimeError("relay process must expose exactly one OPENROUTER_MODELS value")
    return matches[0].decode("utf-8")


def validate(value):
    models = value.split(",")
    if not 1 <= len(models) <= 100 or len(models) != len(set(models)) or not all(MODEL.fullmatch(m) for m in models):
        raise RuntimeError("invalid or duplicate OpenRouter model identifier")
    return models


def read_optional(path):
    return path.read_text(encoding="utf-8") if path.exists() else None


def atomic(path, value, mode=0o600):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp." + str(os.getpid()))
    try:
        with os.fdopen(os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode), "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        os.chmod(path, mode)
    finally:
        if tmp.exists():
            tmp.unlink()


def restore(data):
    for path, key, mode in [(ENVFILE, "envfile", 0o600), (DROPIN, "dropin", 0o644)]:
        prior = data[key]
        if prior is None:
            path.unlink(missing_ok=True)
        else:
            atomic(path, prior, mode)
    run("systemctl", "daemon-reload")
    run("systemctl", "restart", UNIT)
    verify(data["previous_sha"])


def verify(expected_sha):
    for attempt in range(6):
        if subprocess.run(["systemctl", "is-active", "--quiet", UNIT], check=False).returncode == 0:
            try:
                if sha(live()) == expected_sha:
                    return
            except (OSError, RuntimeError):
                pass
        time.sleep(1)
    raise RuntimeError("relay restart did not activate the expected model allowlist")


def payload_arg(value):
    try:
        data = json.loads(base64.b64decode(value, validate=True).decode("utf-8"))
    except Exception as error:
        raise RuntimeError("invalid deployment payload") from error
    if not isinstance(data, dict):
        raise RuntimeError("deployment payload must be an object")
    desired = data.get("desired_csv", "")
    validate(desired)
    if data.get("desired_sha") != sha(desired):
        raise RuntimeError("deployment payload hash mismatch")
    return data


def execute(mode, data):
    if os.geteuid() != 0:
        raise RuntimeError("SSM relay model sync must run as root")
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK, "a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        current = live()
        validate(current)
        current_sha = sha(current)
        desired = data["desired_csv"]
        desired_sha = data["desired_sha"]
        print("CURRENT_SHA256=" + current_sha, flush=True)
        print("DESIRED_SHA256=" + desired_sha, flush=True)
        print("ALIGNED=" + str(set(current.split(",")) == set(desired.split(","))).lower(), flush=True)
        if mode == "dry-run":
            print("RESULT=dry-run", flush=True)
            return
        if mode == "apply":
            if not HASH.fullmatch(data.get("expected_current_sha", "")) or data["expected_current_sha"] != current_sha:
                raise RuntimeError("stale expected_current_sha; run a fresh dry-run")
            if current_sha == desired_sha:
                print("RESULT=unchanged", flush=True)
                return
            old_dropin = read_optional(DROPIN)
            if old_dropin is not None and old_dropin != DROPIN_CONTENT:
                raise RuntimeError("existing drop-in is not managed by model sync")
            old_env = read_optional(ENVFILE)
            if old_env is not None and not old_env.startswith("OPENROUTER_MODELS="):
                raise RuntimeError("existing model env file is not managed by model sync")
            old_snapshot = read_optional(SNAPSHOT)
            if old_snapshot is not None:
                prior = json.loads(old_snapshot)
                if prior.get("applied_sha") != current_sha:
                    raise RuntimeError("stale rollback snapshot; manual review required")
            snapshot = {"schema": 1, "envfile": old_env, "dropin": old_dropin,
                        "previous_sha": current_sha, "applied_sha": desired_sha}
            atomic(SNAPSHOT, json.dumps(snapshot, ensure_ascii=False), 0o600)
            try:
                atomic(ENVFILE, "OPENROUTER_MODELS=" + desired + "\n", 0o600)
                atomic(DROPIN, DROPIN_CONTENT, 0o644)
                run("systemctl", "daemon-reload")
                run("systemctl", "restart", UNIT)
                verify(desired_sha)
            except Exception as failure:
                try:
                    restore(snapshot)
                    if old_snapshot is None:
                        SNAPSHOT.unlink(missing_ok=True)
                    else:
                        atomic(SNAPSHOT, old_snapshot, 0o600)
                except Exception as rollback_error:
                    raise RuntimeError("apply failed AND rollback failed; manual intervention required") from rollback_error
                raise RuntimeError("apply failed; previous service config restored") from failure
            print("RESULT=changed", flush=True)
            return
        if mode == "rollback":
            if current_sha != desired_sha:
                raise RuntimeError("rollback refused: running model allowlist differs from expected applied value")
            if not SNAPSHOT.exists():
                raise RuntimeError("rollback refused: no managed rollback snapshot")
            snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
            if snapshot.get("schema") != 1 or snapshot.get("applied_sha") != desired_sha:
                raise RuntimeError("rollback refused: snapshot does not match applied model list")
            if read_optional(DROPIN) != DROPIN_CONTENT or read_optional(ENVFILE) != "OPENROUTER_MODELS=" + desired + "\n":
                raise RuntimeError("rollback refused: managed files have changed")
            restore(snapshot)
            SNAPSHOT.unlink(missing_ok=True)
            print("RESULT=rolled-back", flush=True)
            return
        raise RuntimeError("unknown mode")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3 or sys.argv[1] not in ("dry-run", "apply", "rollback"):
            raise RuntimeError("usage: remote.py dry-run|apply|rollback BASE64_PAYLOAD")
        execute(sys.argv[1], payload_arg(sys.argv[2]))
    except Exception as exc:
        print("ERROR=" + str(exc), file=sys.stderr)
        sys.exit(1)
