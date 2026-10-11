"""Rebuild reviewed public Sunrise geography from the pinned author export."""
import hashlib
import json
import pathlib
import re
import sys
import zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
 1: ('4afe97b2b9e99ad7fdf29129928b34797f9eb2785824951a057f54a90ee3ce2d', 'sunrise-cbd-geography', '曙光市｜中央商業區', ['中央商業區', 'CBD'], {0,1,2,3,4,5,6,7}),
 2: ('10747da3b24eaaf9eae18e17053e2a6e6042311248d24c236f441c90bfa1396e', 'sunrise-port-geography', '曙光市｜港口生活地理', ['港口工業區'], {0,6})
}
sha = lambda content: hashlib.sha256(content.encode()).hexdigest()
def build(zip_path):
 with zipfile.ZipFile(zip_path) as archive:
  names = [n for n in archive.namelist() if n.endswith('.json')]
  original = json.loads(archive.read(next(n for n in names if '囚徒' in n)))
  shared = json.loads(archive.read(next(n for n in names if '精靈王' in n)))
 if original['worldbook']['id'] != '5808c2c1-a71c-417e-b07c-23d75d36735e' or original['worldbook']['visibility'] != '公開' or len(original['entries']) != 183:
  raise ValueError('Unexpected export version or visibility')
 packs, mapping = [], []
 for index, (digest, pack_id, name, keywords, allowed) in SOURCES.items():
  entry = original['entries'][index]; content = entry['content']
  if sha(content) != digest or content != shared['entries'][index]['content'] or entry['category'] != '地點':
   raise ValueError('Source changed; review again')
  starts = [m.start() for m in re.finditer(r'^## ', content, re.M)]
  if starts[0] != 0: starts.insert(0,0)
  spans = list(zip(starts, starts[1:] + [len(content)]))
  entries, review = [], []
  for part, (start,end) in enumerate(spans):
   value = content[start:end].strip(); title = value.splitlines()[0].lstrip('# ').strip()
   kept = part in allowed
   record = {'chapter':part,'title':title,'start':start,'end':end,'sha256':sha(value),'status':'published' if kept else 'deferred'}
   if kept:
    eid = f'sunrise-source-{index}-{part}'; record['entry_id'] = eid
    entries.append({'id':eid,'title':name+'｜'+title,'category':'世界資料','mode':'keyword','keywords':keywords + ({1:['曙光金融大廈','天際商場','凱旋企業總部','司法大廈','曙光國際會議中心'],2:['曙光證券交易所','泰坦科技','晨曦集團','極光製藥','銀河傳媒']} .get(part, []) if index == 1 else []),'content':value})
   review.append(record)
  packs.append({'schema':'yorubay-worldbook-pack','version':1,'meta':{'id':pack_id,'name':name,'world':'sunrise-city','classification':'world','author':'班長／肉包','release':'1.0.0','visibility':'public','source':'囚徒的自白／精靈王共用原文｜審閱地理章節（2026-10-11）'},'entries':entries})
  mapping.append({'source_index':index,'source_sha256':digest,'source_chars':len(content),'chapters':review})
 return {'packs':packs}, {'source_worldbook_id':original['worldbook']['id'],'shared_content_verified':True,'sources':mapping}
if __name__ == '__main__':
 catalog, mapping = build(sys.argv[1])
 for name, value in [('sunrise-worldbook-library.json',catalog),('sunrise-geography-source-map.json',mapping)]:
  (ROOT/'data'/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
