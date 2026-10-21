#!/usr/bin/env python3
"""Offline unit tests for SSM relay allowlist apply/rollback safety."""
import importlib.util
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import tempfile

source = Path(__file__).resolve().parents[1] / 'scripts/aws-model-allowlist-remote.py'
spec = importlib.util.spec_from_file_location('yorubay_relay_sync', source)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def harness(tmp):
    directory = Path(tmp)
    mod.DIRECTORY = directory
    mod.DROPIN = directory / '95-yorubay-model-registry.conf'
    mod.ENVFILE = directory / '95-yorubay-model-registry.env'
    mod.SNAPSHOT = directory / '.yorubay-model-registry-rollback.json'
    mod.LOCK = directory / 'yorubay.lock'
    mod.DROPIN_CONTENT = '[Service]\nEnvironmentFile=' + str(mod.ENVFILE) + '\n'
    state = {'live': 'google/gemma-4-31b-it,xiaomi/mimo-v2.5', 'restart_count': 0, 'fail_once': False}
    original = state['live']

    def fake_run(*args):
        if args[:2] == ('systemctl', 'restart'):
            state['restart_count'] += 1
            if state['fail_once']:
                state['fail_once'] = False
                raise RuntimeError('simulated restart failure')
            if mod.ENVFILE.exists() and mod.DROPIN.exists():
                state['live'] = mod.ENVFILE.read_text().strip().split('=', 1)[1]
            else:
                state['live'] = original
        return ''

    mod.run = fake_run
    mod.live = lambda: state['live']
    mod.verify = lambda expected: (_ for _ in ()).throw(RuntimeError('bad live model hash')) if mod.sha(state['live']) != expected else None
    mod.os.geteuid = lambda: 0
    return state


def expect_error(action, contains):
    try:
        action()
    except RuntimeError as error:
        assert contains in str(error), (contains, str(error))
    else:
        raise AssertionError('expected error: ' + contains)


desired = 'google/gemma-4-31b-it,xiaomi/mimo-v2.6-flash'
payload = {'desired_csv': desired, 'desired_sha': mod.sha(desired)}
with tempfile.TemporaryDirectory() as temp:
    state = harness(temp)
    prior = state['live']
    log = io.StringIO()
    with redirect_stdout(log):
        mod.execute('dry-run', payload)
    assert 'RESULT=dry-run' in log.getvalue()
    assert not mod.DROPIN.exists() and not mod.ENVFILE.exists()
    expect_error(lambda: mod.execute('apply', dict(payload, expected_current_sha='0'*64)), 'stale expected_current_sha')
    mod.execute('apply', dict(payload, expected_current_sha=mod.sha(prior)))
    assert state['live'] == desired
    assert mod.SNAPSHOT.exists()
    expect_error(lambda: mod.execute('rollback', dict(payload, desired_sha='0'*64)), 'rollback refused')
    mod.execute('rollback', payload)
    assert state['live'] == prior
    assert not mod.ENVFILE.exists() and not mod.DROPIN.exists() and not mod.SNAPSHOT.exists()
    state['fail_once'] = True
    expect_error(lambda: mod.execute('apply', dict(payload, expected_current_sha=mod.sha(prior))), 'previous service config restored')
    assert state['live'] == prior
    assert not mod.DROPIN.exists() and not mod.SNAPSHOT.exists()
    mod.execute('apply', dict(payload, expected_current_sha=mod.sha(prior)))
    assert state['live'] == desired
    mod.execute('apply', dict(payload, expected_current_sha=mod.sha(desired)))
    assert state['live'] == desired
    assert json.loads(mod.SNAPSHOT.read_text())['previous_sha'] == mod.sha(prior)
print('AWS relay remote apply, stale guard, rollback and failure recovery passed')
