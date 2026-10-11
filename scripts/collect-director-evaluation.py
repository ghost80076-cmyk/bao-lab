"""Collect paired model responses for human review; never modify production state.

Input: {model, cases:[{case_id, work_path, baseline_messages, combined_messages}]}.
Messages must be captured from a representative work, with identical dynamic input.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('evaluation', ROOT / 'scripts/evaluate-three-realms-director.py')
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


def validate(packet):
    if set(packet) != {'model', 'cases'} or not isinstance(packet['model'], str) or not packet['model'].strip():
        raise ValueError('Expected model and cases')
    expected = {x['id'] for x in evaluation.load_json(evaluation.FIXTURE)['cases']}
    seen = set()
    for case in packet['cases']:
        if set(case) != {'case_id', 'work_path', 'baseline_messages', 'combined_messages'}:
            raise ValueError('Unexpected case fields')
        if case['case_id'] not in expected or case['case_id'] in seen:
            raise ValueError('Unknown or duplicate case')
        seen.add(case['case_id'])
        path = (ROOT / case['work_path']).resolve()
        if not path.is_relative_to(ROOT / 'data/characters') or not path.is_file() or path.suffix != '.json':
            raise ValueError('Expected repository character file')
        for variant in ('baseline', 'combined'):
            messages = case[variant + '_messages']
            if not isinstance(messages, list) or not messages:
                raise ValueError('Missing captured messages')
            for message in messages:
                if set(message) != {'role', 'content'} or message['role'] not in ('system', 'user', 'assistant') or not isinstance(message['content'], str):
                    raise ValueError('Invalid captured message')
        # Experiment can change stable task instructions, never the observed turn.
        turns = lambda variant: [m for m in case[variant + '_messages'] if m['role'] != 'system']
        if turns('baseline') != turns('combined'):
            raise ValueError('Unpaired dynamic input')
    if seen != expected:
        raise ValueError('Missing cases')


def collect(packet, endpoint, key, output):
    validate(packet)
    if not endpoint.startswith('https://'):
        raise ValueError('HTTPS endpoint required')
    if output.exists():
        raise ValueError('Refusing to overwrite collected evidence')
    output.mkdir(parents=True)
    for case in packet['cases']:
        result = {'case_id': case['case_id'], 'work_path': case['work_path'],
                  'work_sha256': hashlib.sha256((ROOT / case['work_path']).read_bytes()).hexdigest(),
                  'human_reviewed': False}
        for variant in ('baseline', 'combined'):
            messages = case[variant + '_messages']
            payload = {'model': packet['model'], 'messages': messages, 'temperature': 0, 'max_tokens': 1600}
            request = urllib.request.Request(endpoint, data=json.dumps(payload).encode(),
                headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
            start = time.monotonic()
            # No retry or redirects: keep call count exact and credentials on this host.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs):
                    return None
            with urllib.request.build_opener(NoRedirect).open(request, timeout=90) as response:
                raw = json.load(response)
            usage = raw.get('usage', {})
            for field in ('prompt_tokens', 'completion_tokens'):
                evaluation.number(usage.get(field), integer=True)
            result[variant] = {'request': payload, 'text': raw['choices'][0]['message']['content'],
                'input_tokens': usage['prompt_tokens'], 'output_tokens': usage['completion_tokens'],
                'latency_ms': round((time.monotonic() - start) * 1000), 'model_calls': 1}
            # Preserve each completed variant if the subsequent call fails.
            (output / (case['case_id'] + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print('Collected responses and measured usage; human scoring and cache instrumentation still required.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packet', type=pathlib.Path)
    parser.add_argument('--endpoint')
    parser.add_argument('--output', type=pathlib.Path)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    packet = evaluation.load_json(args.packet)
    validate(packet)
    if args.validate_only:
        print('Paired captured inputs validated; no model calls made.')
    else:
        key = os.environ.get('DIRECTOR_EVAL_API_KEY')
        if not key or not args.endpoint or not args.output:
            parser.error('Provide DIRECTOR_EVAL_API_KEY, --endpoint and --output')
        collect(packet, args.endpoint, key, args.output)
