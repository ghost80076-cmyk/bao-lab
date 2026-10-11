"""Record examined sources without publishing deferred text or titles."""
import hashlib
import json
import pathlib
import sys
import zipfile
from sunrise_review_29_48 import chapter_spans
from sunrise_review_49_60 import chapter_spans as family_spans

ROOT = pathlib.Path(__file__).resolve().parents[1]
with zipfile.ZipFile(sys.argv[1]) as archive:
    name = next(n for n in archive.namelist() if '囚徒' in n and n.endswith('.json'))
    original = json.loads(archive.read(name))
coverage = json.loads((ROOT/'data/sunrise-migration-coverage.json').read_text())
mapping = json.loads((ROOT/'data/sunrise-geography-source-map.json').read_text())
sources = {s['source_index']: s for s in mapping['sources']}
digest = lambda text: hashlib.sha256(text.encode()).hexdigest()
records = []
first, last = map(int,sys.argv[2:4]) if len(sys.argv)>2 else (29,48)
if (first,last) not in [(29,48),(49,60)]: raise ValueError('Unknown reviewed batch')
for index in range(first,last+1):
    content = original['entries'][index]['content']
    if digest(content) != coverage['entries'][index]['source_sha256']:
        raise ValueError('Source changed')
    spans = family_spans(index,content) if first==49 else chapter_spans(index,content)
    published = {c['chapter'] for c in sources.get(index,{}).get('chapters',[]) if c['status']=='published'}
    chapters = [{'chapter':part,'start':start,'end':end,'sha256':digest(content[start:end].strip()),
                 'disposition':'published-reference' if part in published else 'withheld-author-source'}
                for part,(start,end) in enumerate(spans)]
    if index in sources:
        expected = sources[index]['chapters']
        if [(c['start'],c['end'],c['sha256']) for c in chapters] != [(c['start'],c['end'],c['sha256']) for c in expected]:
            raise ValueError('Review spans differ from publication audit')
    records.append({'source_index':index,'source_sha256':digest(content),'source_chars':len(content),
                    'review_status':'examined','publication_status':coverage['entries'][index]['status'],
                    'chapters':chapters})
(ROOT/f'data/sunrise-review-batch-{first}-{last}.json').write_text(json.dumps({'schema':'sunrise-source-review-batch',
    'version':1,'sources':records},ensure_ascii=False,indent=2)+'\n')
print(f'Recorded {last-first+1} examined sources; withheld text and titles omitted.')
