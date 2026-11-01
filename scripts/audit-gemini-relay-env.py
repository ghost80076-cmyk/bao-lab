#!/usr/bin/env python3
"""Read only known model-list variables; never emit arbitrary process secrets."""
from pathlib import Path
import re
import sys

MODEL_KEYS = (
    "GEMINI_MODELS", "GEMINI_ALLOWED_MODELS", "ALLOWED_GEMINI_MODELS",
    "GOOGLE_MODELS", "GOOGLE_ALLOWED_MODELS", "ALLOWED_MODELS",
)
MODEL_LIST = re.compile(r"[a-z0-9][a-z0-9._:/-]*(?:,[a-z0-9][a-z0-9._:/-]*)*")


def summarize(raw):
    entries = raw.split(b"\0")
    output = []
    for key in MODEL_KEYS:
        values = [entry[len(key) + 1:] for entry in entries
                  if entry.startswith(key.encode() + b"=")]
        if not values:
            output.append(f"GEMINI_ENV_{key}=ABSENT")
            continue
        if len(values) != 1:
            output.append(f"GEMINI_ENV_{key}=DUPLICATE_REDACTED")
            continue
        value = values[0].decode("utf-8", errors="replace")
        # Report only whether the target model is present, never the raw value.
        if not value or not MODEL_LIST.fullmatch(value):
            output.append(f"GEMINI_ENV_{key}=UNRECOGNIZED_REDACTED")
        else:
            present = "gemini-3.8-flash" in value.split(",")
            output.append(f"GEMINI_ENV_{key}=PRESENT;TARGET_3_8={str(present).lower()}")
    output.append("GEMINI_ENV_SCOPE=known_process_variables_only;code_defaults_and_upstream_unverified")
    return "\n".join(output)


if __name__ == "__main__":
    pid = sys.argv[1]
    if not pid.isdigit() or int(pid) <= 0:
        raise SystemExit("invalid relay PID")
    print(summarize((Path("/proc") / pid / "environ").read_bytes()))
