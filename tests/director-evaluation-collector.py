"""Offline collection tests: invalid pairs never call the network, evidence survives failure."""
import copy
import importlib.util
import json
import pathlib
import tempfile
from unittest.mock import patch
ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('collector', ROOT / 'scripts/collect-director-evaluation.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
fixture = collector.evaluation.load_json(collector.evaluation.FIXTURE)
packet = {'model': 'offline-test', 'cases': [dict(case_id=c['id'], work_path='data/characters/community/28/zhutian-cultivation-fortune-strife.json', baseline_messages=[{'role':'system','content':'state only'}, {'role':'user','content':c['setup']}], combined_messages=[{'role':'system','content':'state and director'}, {'role':'user','content':c['setup']}]) for c in fixture['cases']]}
collector.validate(packet)
for change in ('missing', 'duplicate', 'unpaired', 'path'):
    bad = copy.deepcopy(packet)
    if change == 'missing': bad['cases'].pop()
    if change == 'duplicate': bad['cases'].append(bad['cases'][0])
    if change == 'unpaired': bad['cases'][0]['combined_messages'][-1]['content'] = 'different turn'
    if change == 'path': bad['cases'][0]['work_path'] = '../../secret.json'
    try: collector.validate(bad)
    except ValueError: pass
    else: raise AssertionError(change)
class Response:
    def __enter__(self):
        import io
        return io.StringIO(json.dumps({'choices':[{'message':{'content':'{}'}}], 'usage':{'prompt_tokens':10,'completion_tokens':2}}))
    def __exit__(self, *args): pass
class Opener:
    calls = 0
    def open(self, request, timeout):
        self.calls += 1
        if self.calls == 2: raise RuntimeError('simulated interruption')
        return Response()
with tempfile.TemporaryDirectory() as directory:
    output = pathlib.Path(directory) / 'evidence'
    with patch.object(collector.urllib.request, 'build_opener', return_value=Opener()):
        try: collector.collect(packet, 'https://example.invalid/chat/completions', 'test-secret', output)
        except RuntimeError: pass
    saved = (output / 'quiet-workday.json').read_text()
    assert 'test-secret' not in saved
    assert json.loads(saved)['baseline']['model_calls'] == 1
    assert json.loads(saved)['human_reviewed'] is False
    try: collector.collect(packet, 'https://example.invalid/chat/completions', 'test-secret', output)
    except ValueError: pass
    else: raise AssertionError('overwrote evidence')
print('Director collector: input pairing, source bounds, secret exclusion and interrupted evidence passed.')
