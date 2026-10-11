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
 2: ('10747da3b24eaaf9eae18e17053e2a6e6042311248d24c236f441c90bfa1396e', 'sunrise-port-geography', '曙光市｜港口生活地理', ['港口工業區'], {0,6}),
 98: ('32830cfa8926ca78c672907c94d35eda8fcf8d6dd9bc611c216bc2a851b437a1', 'sunrise-north-geography', '曙光市｜北山生活地理', ['北山住宅區'], {0,1,3}),
 99: ('bb5a9058afb79975f44f3a48b271a429ad6cb5d670e18664c2da3c2abda7d112', 'sunrise-north-geography', '曙光市｜北山生活地理', ['北山住宅區'], {1}),
 101: ('4f8800d5b5662b9469326ae47d49eb8c5a6aa80360c51542eb1b883fd88e0011', 'sunrise-east-geography', '曙光市｜東區生活地理', ['東區平民區'], {0,1,3,4}),
 104: ('8e68738d0be6e1a39ed1cddca66c55eb1b7fe7c0f8e6fb67eb3c48fb3925a933', 'sunrise-south-geography', '曙光市｜南區環境地理', ['曙光市南區', '南區貧民窟'], {0,1}),
 49: ('b0095ba3033e5691bf22a91d0bc8e0e75df959cba6a3cec98ef7f2a5c412d478', 'sunrise-academy-background', '曙光市｜天璇學院基本資料', ['天璇異能學院'], {0,3}),
 107: ('ae9a5ecf3cc6cd2347e81e38f05d00159180e2f2a46c0fe1013bd8379678577b', 'sunrise-police-background', '曙光市｜警局基本資料', ['曙光市警局'], {0}),
 117: ('c00a586d409b6aafe79ee808a51c6c8da3aa68a94685ac46af01ca410c2ad946', 'sunrise-triumph-background', '曙光市｜凱旋企業公開背景', ['凱旋企業集團'], {0,5}),
 119: ('008d68578c55d678edf854d2414dbd52233b7631048e07dae1c80febe09222c6', 'sunrise-prison-background', '曙光市｜第一監獄設施與生活', ['曙光市第一監獄'], {0,3,4}),
 120: ('3bf1f5a14ff484b98b3858b4b09300059ffcab21e059cb28f6a49dfc5fca0226', 'sunrise-prison-background', '曙光市｜第一監獄設施與生活', ['曙光市第一監獄'], {1}),
 5: ('2c6d6f17185d0b6e682d602ddaa575cb33e76bcb40399b852f9be1be208fe6ba', 'sunrise-abandoned-dock', '曙光市｜廢棄碼頭基本地理', ['廢棄9號碼頭', '廢棄 9 號碼頭', '9 號碼頭', '9號碼頭'], {1}),
 6: ('48e9e1a2e2866153b5891928880c317ff90f65ce2fa58e06edf4ed16f1873bc5', 'sunrise-dock-scenario', '曙光市｜廢棄碼頭劇情方向', ['廢棄9號碼頭', '廢棄 9 號碼頭', '9 號碼頭', '9號碼頭'], {3}),
 8: ('4fc9905b80b7306b35c7be622cc4dc774b92cc64850811da745b30030dd708cc', 'sunrise-police-people', '曙光市｜警方與海關背景（不代表在場）', ['林雨萱'], {0,1}),
 9: ('90d341a807e0857947dcb8a2314a86c9d6211aae998b218d4c4a6649038c0e57', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['陳大海'], {0,1}),
 10: ('255fb4a5133e9e603af9f2c36ce4f64ba6ab6b7cb26e54f62562f83aa2d44927', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['Victor'], {0,1}),
 11: ('4dcd8676dad671396a512983a46047badebbd8184a5ab986d5b50a41c6b54a4a', 'sunrise-police-people', '曙光市｜警方與海關背景（不代表在場）', ['林正義'], {0,1}),
 12: ('592d1dcabf5bfe12be1eab14c84417bd70182dee9468de6ef695cf649a25cb13', 'sunrise-police-people', '曙光市｜警方與海關背景（不代表在場）', ['李明哲'], {0,1}),
 13: ('681d3cc350dacc8a513f68d8d9cade258bdff8de96e4d964829657c035eead3a', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['老張'], {0,1}),
 14: ('8f8a108d0aa0d0c57af2b78b0b30f81df3b22540991e2762033ddec245c92821', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['瘦猴'], {0,1}),
 15: ('30ac5a605b9920c7fffe781b64ec0e8036b0210c4c18a3dcf1480cc17376e626', 'sunrise-port-people', '曙光市｜港口人物背景（不代表在場）', ['啞巴阿文'], {0,1}),
 0: ('4834e239dddf64bc25c350cf6be0f3fbcabdae936fee9804872f788f11916a63', 'sunrise-city-overview', '曙光市｜城市與社會概況', ['曙光市'], {0,1,3}),
 138: ('5dea856117c564988fae4178292d996961fe53699b086e76a5725d8047854947', 'sunrise-prison-institution', '曙光市｜監獄探視與減刑（虛構世界制度）', ['曙光市第一監獄探視', '第一監獄探視', '第一監獄減刑'], {4,5}),
 33: ('0edb3ba2e7baa92c6f33d80737b4dbd9d7cd510d9bad521a04828af4fac10678', 'sunrise-ability-background', '曙光市｜異能背景（虛構設定）', ['曙光市異能'], {0,2,3,4,6}),
 34: ('620511dae42fc2d536e0ecf3103e1ec5f9b7ac4106d8694070fbf762af17ac38', 'sunrise-ability-institution', '曙光市｜異能分類與監控（虛構制度）', ['異能分類'], {0,4})
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
  if sha(content) != digest or content != shared['entries'][index]['content'] or entry['category'] != ('角色' if 8 <= index <= 15 else '規則' if index in (0, 33, 34, 138) else '地點'):
   raise ValueError('Source changed; review again')
  starts = [m.start() for m in re.finditer(r'^#{2,3} ' if index == 138 else r'^## ' if index in (0, 1, 2, 5, 6) else r'^### ', content, re.M)]
  if not starts or starts[0] != 0: starts.insert(0,0)
  spans = list(zip(starts, starts[1:] + [len(content)]))
  entries, review = [], []
  for part, (start,end) in enumerate(spans):
   value = content[start:end].strip(); title = value.splitlines()[0].lstrip('# ').strip()
   kept = part in allowed
   record = {'chapter':part,'title':title,'start':start,'end':end,'sha256':sha(value),'status':'published' if kept else 'deferred'}
   if kept:
    eid = f'sunrise-source-{index}-{part}'; record['entry_id'] = eid
    recall_keywords = {
     (33,0): ['曙光市異能', '異能來源理論'], (33,2): ['異能覺醒'],
     (33,3): ['異能訓練'], (33,4): ['異能限制'], (33,6): ['異能者登記法', '異能者權益', '異能者歧視'],
     (34,0): ['異能分類', '八大主類'], (34,4): ['異能監控等級', '異能者管理局監控']
    }.get((index, part), keywords)
    entries.append({'id':eid,'title':name+'｜'+(keywords[0]+'｜' if 8 <= index <= 15 else '')+title,'category':'人物資料' if 8 <= index <= 15 else '世界資料','mode':'keyword','keywords':recall_keywords + ({1:['曙光金融大廈','天際商場','凱旋企業總部','司法大廈','曙光國際會議中心'],2:['曙光證券交易所','泰坦科技','晨曦集團','極光製藥','銀河傳媒']} .get(part, []) if index == 1 else []),'content':value})
   review.append(record)
  groups = [(pack_id, name, entries)]
  if index == 49:
   scenario = [e for e in entries if e['id'] == 'sunrise-source-49-3']
   groups = [(pack_id, name, [e for e in entries if e not in scenario]),
             ('sunrise-academy-scenario', '曙光市｜學院劇情方向', scenario)]
  for group_id, group_name, group_entries in groups:
   if group_id != pack_id:
    for item in group_entries: item["title"] = group_name + "｜" + item["title"].split("｜", 2)[-1]
   existing = next((pack for pack in packs if pack['meta']['id'] == group_id), None)
   if existing:
    existing['entries'].extend(group_entries)
   else:
    packs.append({'schema':'yorubay-worldbook-pack','version':1,'meta':{'id':group_id,'name':group_name,'world':'sunrise-city','classification':'scenario' if group_id.endswith('-scenario') else 'reference' if group_id.endswith('-people') else 'world','author':'班長／肉包','release':'1.0.0','visibility':'public','source':'囚徒的自白／精靈王共用原文｜審閱地理章節（2026-10-11）'},'entries':group_entries})
  mapping.append({'source_index':index,'source_sha256':digest,'source_chars':len(content),'chapters':review})
 return {'packs':packs}, {'source_worldbook_id':original['worldbook']['id'],'shared_content_verified':True,'sources':mapping}
if __name__ == '__main__':
 catalog, mapping = build(sys.argv[1])
 for name, value in [('sunrise-worldbook-library.json',catalog),('sunrise-geography-source-map.json',mapping)]:
  (ROOT/'data'/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
