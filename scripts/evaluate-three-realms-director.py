"""Validate paired, externally measured Director experiment observations; never call a model."""
import argparse
import copy
import json
import math
import pathlib
import tempfile

FIXTURE = pathlib.Path(__file__).resolve().parents[1] / 'tests/fixtures/three-realms-director-evaluation.json'
CRITICAL = ('world_state_errors', 'agency_violations', 'information_leaks', 'forced_events', 'unconfirmed_state_writes')
SCORES = ('causal_consistency', 'npc_autonomy', 'offscreen_plausibility', 'pacing', 'quiet_turn_quality')
METRICS = ('input_tokens', 'output_tokens', 'latency_ms')
OBSERVATION_KEYS = set(CRITICAL + SCORES + METRICS + ('model_calls', 'stable_prefix_changed_between_turns'))

def load_json(path):
    def reject(value):
        raise ValueError('Non-finite JSON number: ' + value)
    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON key: ' + key)
            result[key] = value
        return result
    return json.loads(path.read_text(), parse_constant=reject, object_pairs_hook=object_pairs)

def number(value, minimum=0, maximum=None, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or abs(value) > 10**12 or not math.isfinite(value) or value < minimum:
        raise ValueError('Invalid measured value')
    if maximum is not None and value > maximum:
        raise ValueError('Value exceeds scale')
    if integer and not isinstance(value, int):
        raise ValueError('Expected integer count')

def validate_observation(row):
    if not isinstance(row, dict) or set(row) != OBSERVATION_KEYS:
        raise ValueError('Unexpected or missing observation fields')
    for key in CRITICAL:
        number(row[key], integer=True)
    for key in SCORES:
        number(row[key], maximum=4, integer=True)
    for key in METRICS:
        number(row[key], integer=key != 'latency_ms')
    number(row['model_calls'], integer=True)
    if type(row['stable_prefix_changed_between_turns']) is not bool:
        raise ValueError('Expected cache-placement boolean')

def evaluate(report, fixture):
    if not isinstance(report, dict) or set(report) != {'schema', 'synthetic', 'run_metadata', 'observations'}:
        raise ValueError('Unexpected report shape')
    if report['schema'] != 'yorubay-director-paired-observations-v1' or type(report['synthetic']) is not bool:
        raise ValueError('Unexpected report schema')
    metadata = report['run_metadata']
    if not isinstance(metadata, dict) or set(metadata) != {'model', 'timestamp', 'reviewer', 'same_input_and_settings', 'cost_latency_review_accepted'}:
        raise ValueError('Missing run/reviewer metadata')
    for key in ('model', 'timestamp', 'reviewer'):
        if not isinstance(metadata[key], str) or not metadata[key].strip() or len(metadata[key]) > 200:
            raise ValueError('Missing bounded run identity')
    for key in ('same_input_and_settings', 'cost_latency_review_accepted'):
        if type(metadata[key]) is not bool:
            raise ValueError('Expected reviewer boolean')
    observations = report['observations']
    if not isinstance(observations, list):
        raise ValueError('Expected observations list')
    expected_ids = {case['id'] for case in fixture['cases']}
    if fixture['case_count'] != len(fixture['cases']) or len(expected_ids) != fixture['case_count']:
        raise ValueError('Invalid evaluation fixture case inventory')
    seen, blockers = set(), []
    improvements = 0
    totals = {variant: {key: 0 for key in METRICS} for variant in ('baseline', 'combined')}
    for item in observations:
        if not isinstance(item, dict) or set(item) != {'case_id', 'baseline', 'combined', 'human_reviewed'}:
            raise ValueError('Unexpected case observation')
        case_id = item['case_id']
        if not isinstance(case_id, str) or case_id not in expected_ids or case_id in seen:
            raise ValueError('Unknown or duplicate evaluation case')
        seen.add(case_id)
        if type(item['human_reviewed']) is not bool:
            raise ValueError('Expected human-review boolean')
        if not item['human_reviewed']:
            blockers.append(case_id + ': human_review_required')
        for variant in ('baseline', 'combined'):
            row = item[variant]
            validate_observation(row)
            if row['model_calls'] != 1:
                blockers.append(case_id + ': ' + variant + '_extra_model_call')
            if row['stable_prefix_changed_between_turns']:
                blockers.append(case_id + ': ' + variant + '_dynamic_stable_prefix')
            for key in METRICS:
                totals[variant][key] += row[key]
        baseline, combined = item['baseline'], item['combined']
        for key in CRITICAL:
            if combined[key] != 0:
                blockers.append(case_id + ': ' + key)
        for key in SCORES:
            if combined[key] < baseline[key]:
                blockers.append(case_id + ': regression_' + key)
            if combined[key] > baseline[key]:
                improvements += 1
    if seen != expected_ids:
        raise ValueError('Evaluation cases missing')
    if not metadata['same_input_and_settings']:
        blockers.append('unpaired_inputs_or_settings')
    if not metadata['cost_latency_review_accepted']:
        blockers.append('cost_latency_review_required')
    if not improvements:
        blockers.append('no_reviewed_quality_improvement')
    if report['synthetic']:
        blockers.append('synthetic_observations_are_not_runtime_evidence')
    return {
        'schema': 'yorubay-director-evaluation-summary-v1',
        'case_count': len(seen), 'fixture_version': fixture['version'],
        'contract_gate_passed': not blockers, 'runtime_enabled': False,
        'blockers': blockers, 'reviewed_improvement_count': improvements,
        'measured_totals': totals,
        'measured_deltas': {key: totals['combined'][key] - totals['baseline'][key] for key in METRICS},
        'limitation': 'Validates supplied measurements and human scores; does not independently verify prose quality, reviewers or instrumentation. Runtime promotion requires experiment review.'
    }

def synthetic_report(fixture):
    # Parser tests only: these are NOT model results or production evidence.
    baseline = {key: 0 for key in CRITICAL}
    baseline.update({key: 2 for key in SCORES})
    baseline.update(input_tokens=100, output_tokens=20, latency_ms=50, model_calls=1, stable_prefix_changed_between_turns=False)
    combined = dict(baseline, pacing=3)
    return {'schema': 'yorubay-director-paired-observations-v1', 'synthetic': True,
            'run_metadata': {'model': 'synthetic-parser-test', 'timestamp': 'synthetic', 'reviewer': 'synthetic', 'same_input_and_settings': True, 'cost_latency_review_accepted': True},
            'observations': [{'case_id': case['id'], 'baseline': dict(baseline), 'combined': dict(combined), 'human_reviewed': True} for case in fixture['cases']]}

def self_test(fixture):
    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory) / 'invalid.json'
        for raw in ('{"count":1,"count":2}', '{"count":NaN}', '{"count":Infinity}'):
            path.write_text(raw)
            try:
                load_json(path)
            except ValueError:
                pass
            else:
                raise AssertionError('Ambiguous or non-finite JSON accepted')
    sample = synthetic_report(fixture)
    result = evaluate(sample, fixture)
    assert result['runtime_enabled'] is False and result['contract_gate_passed'] is False
    assert result['blockers'] == ['synthetic_observations_are_not_runtime_evidence']
    for change in ('missing', 'duplicate', 'nan', 'bool_count', 'negative', 'unknown', 'extra_field'):
        bad = copy.deepcopy(sample)
        if change == 'missing': bad['observations'].pop()
        if change == 'duplicate': bad['observations'].append(copy.deepcopy(bad['observations'][0]))
        if change == 'nan': bad['observations'][0]['combined']['latency_ms'] = float('nan')
        if change == 'bool_count': bad['observations'][0]['combined']['model_calls'] = True
        if change == 'negative': bad['observations'][0]['combined']['output_tokens'] = -1
        if change == 'unknown': bad['observations'][0]['case_id'] = 'unknown'
        if change == 'extra_field': bad['observations'][0]['combined']['tools'] = ['execute']
        try:
            evaluate(bad, fixture)
        except ValueError:
            pass
        else:
            raise AssertionError('Unsafe report accepted: ' + change)
    for key, value, expected in [('information_leaks', 1, 'information_leaks'), ('model_calls', 2, 'extra_model_call'), ('stable_prefix_changed_between_turns', True, 'dynamic_stable_prefix'), ('npc_autonomy', 1, 'regression_npc_autonomy')]:
        bad = copy.deepcopy(sample)
        bad['observations'][0]['combined'][key] = value
        assert any(expected in item for item in evaluate(bad, fixture)['blockers'])
    bad = copy.deepcopy(sample)
    bad['observations'][0]['human_reviewed'] = False
    assert any('human_review_required' in item for item in evaluate(bad, fixture)['blockers'])
    print('Director evaluation intake: missing/duplicate cases, invalid metrics, human review, regressions, synthetic evidence and no runtime promotion checks passed.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('observations', type=pathlib.Path, nargs='?')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    fixture = load_json(FIXTURE)
    if args.self_test:
        self_test(fixture)
    elif args.observations:
        result = evaluate(load_json(args.observations), fixture)
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        raise SystemExit(0 if result['contract_gate_passed'] else 1)
    else:
        parser.error('Supply measured observations or --self-test')
