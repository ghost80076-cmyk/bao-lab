"""Verify published spans against author export and inventory every source entry.

The inventory contains hashes and counts, never unpublished source text.
"""
import collections
import hashlib
import json
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
digest = lambda value: hashlib.sha256(value.encode()).hexdigest()

def audit(export_path):
    with zipfile.ZipFile(export_path) as archive:
        name = next(n for n in archive.namelist() if '囚徒' in n and n.endswith('.json'))
        original = json.loads(archive.read(name))
    mapping = json.loads((ROOT / 'data/sunrise-geography-source-map.json').read_text())
    catalog = json.loads((ROOT / 'data/sunrise-worldbook-library.json').read_text())
    if original['worldbook']['visibility'] != '公開' or original['worldbook']['id'] != mapping['source_worldbook_id'] or len(original['entries']) != 183:
        raise ValueError('Unexpected public source version')
    reviewed = {s['source_index']: s for s in mapping['sources']}
    if len(reviewed) != len(mapping['sources']):
        raise ValueError('Duplicate source mapping')
    entries = [e for p in catalog['packs'] for e in p['entries']]
    published = {e['id']: e for e in entries}
    if len(published) != len(entries):
        raise ValueError('Duplicate published entry')
    visited, inventory = set(), []
    for index, entry in enumerate(original['entries']):
        content, source = entry['content'], reviewed.get(index)
        kept, deferred = 0, 0
        if source:
            if source['source_sha256'] != digest(content) or source['source_chars'] != len(content):
                raise ValueError(f'Source changed: {index}')
            offset = 0
            for chapter in source['chapters']:
                start, end = chapter['start'], chapter['end']
                if start != offset or not start < end <= len(content):
                    raise ValueError(f'Invalid span: {index}')
                value = content[start:end].strip()
                if digest(value) != chapter['sha256']:
                    raise ValueError(f'Chapter changed: {index}')
                if chapter['status'] == 'published':
                    eid = chapter['entry_id']
                    if eid in visited or published[eid]['content'] != value:
                        raise ValueError(f'Published text differs: {eid}')
                    visited.add(eid)
                    kept += 1
                elif chapter['status'] == 'deferred':
                    deferred += 1
                else:
                    raise ValueError('Unknown chapter status')
                offset = end
            if offset != len(content):
                raise ValueError(f'Incomplete span coverage: {index}')
        inventory.append({'source_index': index, 'category': entry['category'],
                          'source_sha256': digest(content),
                          'status': 'unreviewed' if not source else 'partial' if deferred else 'complete',
                          'published_chapters': kept, 'deferred_chapters': deferred})
    if set(reviewed) - set(range(len(inventory))) or visited != set(published):
        raise ValueError('Unmapped source or published chapter')
    counts = dict(collections.Counter(e['status'] for e in inventory))
    return {'source_worldbook_id': original['worldbook']['id'],
            'summary': {'source_entries': len(inventory), 'packs': len(catalog['packs']),
                        'published_chapters': len(visited), 'coverage': counts},
            'entries': inventory}

if __name__ == '__main__':
    result = audit(sys.argv[1])
    (ROOT / 'data/sunrise-migration-coverage.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['summary'], ensure_ascii=False))
