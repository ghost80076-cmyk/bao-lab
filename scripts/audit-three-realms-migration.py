"""Inventory all public source entries and distinguish factual, native and pending work."""
import argparse
import collections
import hashlib
import json
import pathlib

BOOK_ID = 'b43bd078-1b19-46e8-bfc8-952660be367d'

def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()

def build(source, root):
    book = source.get('worldbook', {})
    if book.get('id') != BOOK_ID or book.get('visibility') != '公開' or len(source['entries']) != 191:
        raise ValueError('Only the reviewed public edition is supported')
    output = root / 'data/three-realms-migration-coverage.json'
    if output.exists():
        for record in json.loads(output.read_text())['records']:
            if digest(source['entries'][record['source_index']]['content']) != record['source_sha256']:
                raise ValueError('Source edition changed; review before changing coverage')
    facts = {}
    for path in sorted((root / 'data').glob('three-realms-*-source-map.json')):
        manifest = json.loads(path.read_text())
        if manifest.get('schema') != 'yorubay-worldbook-source-map':
            continue
        for record in manifest['records']:
            index = record['source_index']
            if index in facts:
                raise ValueError('Duplicate factual source migration')
            if digest(source['entries'][index]['content']) != record['source_sha256']:
                raise ValueError('Factual map differs from original edition')
            facts[index] = (str(path.relative_to(root)), record)
    native_path = root / 'data/three-realms-event-director-provenance.json'
    native = {r['source_index']: r for r in json.loads(native_path.read_text())['records']}
    if set(native) & set(facts):
        raise ValueError('Native instructions incorrectly counted as factual sources')
    actors_path = root / 'data/three-realms-actor-provenance.json'
    actors = {r['source_index']: r for r in json.loads(actors_path.read_text())['records']} if actors_path.exists() else {}
    if set(actors) - set(range(32)) or set(actors) & (set(native) | set(facts)):
        raise ValueError('Actor provenance overlaps another migration category')
    catalog = json.loads((root / 'data/worldbook-library.json').read_text())
    packs = [p for p in catalog['packs'] if p['meta']['id'].startswith('three-realms-') and not p['meta']['id'].endswith('-demo')]
    records = []
    for index, original in enumerate(source['entries']):
        record = {'source_index': index, 'source_title': original['title'], 'source_sha256': digest(original['content'])}
        if index in facts:
            path, mapped = facts[index]
            record.update(status='factual', references=[path], chapters=len(mapped['destinations']), omitted_instruction_spans=len(mapped.get('omissions', [])))
            if 76 <= index <= 82:
                record['native_support'] = ['js/three-realms-cultivation-core.js']
        elif index in native:
            if record['source_sha256'] != native[index]['source_sha256']:
                raise ValueError('Native source fingerprint differs')
            record.update(status='native_prompt', references=['data/three-realms-event-director-provenance.json'], profile_id=native[index]['profile_id'], fidelity='adapted-instruction-profile-not-verbatim')
        elif 58 <= index <= 61:
            record.update(status='native_cultivation', references=['docs/three-realms-cultivation-state.md', 'js/three-realms-cultivation-core.js'], fidelity='adapted-state-contract-not-verbatim')
        elif index == 172:
            status_path = root / 'data/three-realms-status-provenance.json'
            if status_path.exists():
                status = json.loads(status_path.read_text())
                if status['source_sha256'] != record['source_sha256']:
                    raise ValueError('Status source fingerprint differs')
                record.update(status='native_status_template', references=['data/three-realms-status-provenance.json', 'docs/three-realms-status-native-review-2026-10-11.md'], follow_up=True)
            else:
                record.update(status='native_renderer_review', references=['docs/three-realms-status-native-review-2026-10-11.md'], follow_up=True)
        elif index in actors:
            if actors[index]['source_sha256'] != record['source_sha256']:
                raise ValueError('Actor source fingerprint differs')
            record.update(status='native_actor_archetype', references=['data/three-realms-actor-provenance.json'], actor_id=actors[index]['actor_id'], fidelity=actors[index]['fidelity'])
        elif index < 32:
            record.update(status='pending_actor_review', references=[], follow_up=True)
        else:
            record.update(status='pending_rule_review', references=['docs/worldbook-native-gap-audit-2026-10-10.md'], follow_up=True)
        records.append(record)
    counts = dict(collections.Counter(r['status'] for r in records))
    if len(facts) != 115 or sum(r.get('chapters', 0) for r in records) != 752 or len(packs) != 45:
        raise ValueError('Factual coverage totals changed; review before updating this milestone')
    payload = {'schema': 'yorubay-worldbook-migration-coverage', 'version': 1, 'source_book_id': BOOK_ID, 'source_visibility': '公開', 'source_entry_count': 191, 'factual_chapters': 752, 'factual_packs': 45, 'status_counts': counts, 'remaining_review_entries': sum(bool(r.get('follow_up')) for r in records), 'records': records}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: payload[k] for k in ['status_counts', 'factual_chapters', 'factual_packs', 'remaining_review_entries']}, ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=pathlib.Path)
    args = parser.parse_args()
    build(json.loads(args.source.read_text()), pathlib.Path(__file__).resolve().parents[1])
