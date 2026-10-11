"""Rebuild reviewed public Sunrise geography from the pinned author export."""
import hashlib
import json
import pathlib
import re
import sys
import zipfile
from sunrise_reconciliation import reconcile_chapter
from sunrise_character_review import ALLOWED, NAMES, KEYWORDS, INSTITUTION_NAMES
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
 16: ('465f4fa232ee13371b220d67bb70477037fa1125c0532d89e2798eaeffc45393', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['異能者管理局副局長', '天璇異能學院董事'], {0, 1}),
 17: ('06ab5bd2a7ced7527d05df6faa4977a8e92dad4a6e1ba3e7ab6a3af90dc101de', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['林宇軒'], {0, 1, 6}),
 18: ('eb80b7b06cf4b41b9664b89f9b5f7b9c9e2e84f255224d8e4e698adf9774afc6', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['雷辰'], {0, 1, 5, 6}),
 19: ('a988b52e6aa452731c275d7165b4d0d5a5840bb07c2c6cb221aa2d43c0253512', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['桃華'], {0, 1, 6}),
 20: ('4fd949c942212596b357e067f52fa0696caed5355f8d0e7f399559e02e05d3a7', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['星野美月'], {0, 1, 6}),
 21: ('5d08c05eb4980bcb7afccf0a6d06457d75346e5d490abea588c9a6ba7976c1a1', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蘇晴'], {0, 1, 6, 7}),
 22: ('1a5ccd5b76161b25e31372429ea8cd9285d20c4df27a78ca3b857d1290fc0b55', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭凜'], {0, 6, 7, 8, 9}),
 23: ('cd5a83ffa1af97aedd4bda77b16c58bf7a6ee09842f789422faa3a37dcf6e767', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭夜'], {0, 6, 7, 8, 9}),
 24: ('fd45e2660c95e1ee2baa7be5a405362203e56120b920d68381ae0028a3265b08', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭辰'], {0, 8, 6}),
 25: ('b04382f8f9e8b000c7d63d458ea61bffa4e777485228ceedecee016b62a7bb23', 'sunrise-family-people', '曙光市｜人物公開參考（不代表在場）', ['蕭星'], {0, 6, 7, 8, 9}),
 26: ('b4589c57066efd17e40a999753a9a647cb78b4b13f0a83371a2ee3b12463162a', 'sunrise-institution-people', '曙光市｜人物公開參考（不代表在場）', ['陳天行'], {0, 1, 2, 3, 4, 5, 6}),
 27: ('4e8e4b95adb36ee9aeb7e18edbe3f751077a78dd609b303e9357aec24cb15b5f', 'sunrise-dock-youth-people', '曙光市｜人物公開參考（不代表在場）', ['阿桃'], {0}),
 28: ('ea5a3ea3e880b994e4351190212824350974b1eac882fe7f9cc3b84b26786e03', 'sunrise-dock-youth-people', '曙光市｜人物公開參考（不代表在場）', ['阿桃居住', '阿桃住處'], {2}),
 96: ('9d40bd423ca93d79e41bfa1f4895b329afc1f104c08aec7cafc0af69a50062ff', 'sunrise-july-record', '曙光市｜血色七月歷史紀錄', ['血色七月'], {0}),
 97: ('e36be103f2f4ea1d499f8923ede29ebe34baaafb8e57031b25813b704b5e9c75', 'sunrise-july-record', '曙光市｜血色七月歷史紀錄', ['血色七月影響', '登記法強制實施'], {1}),
 113: ('a5273301706733d42dbe76f3681e6045fbd1529ffe73d28ea94fcfac847c4499', 'sunrise-wolf-background', '曙光市｜狼幫組織背景', ['狼幫'], {0,1}),
 3: ('a2d2c9cdf2b336667de052d4d3ecfd827ce1764517e621c2eb3d50f558715b95', 'sunrise-container-dock', '曙光市｜貨櫃碼頭基本資料', ['貨櫃碼頭', '1-5 號碼頭', '1–5 號碼頭'], {1}),
 4: ('3975be8f58ac20bb707ce5ab0562133ec9c90dea76e4da0cee9c0eb513e5d069', 'sunrise-container-risk', '曙光市｜貨櫃碼頭環境風險', ['貨櫃碼頭風險', '3 號碼頭', '3號碼頭'], {2}),
 36: ('8e7301af3578a01d3209bab38cb8ce3892df0544528d0ad638815ed22f1049d3', 'sunrise-elemental-abilities', '曙光市｜元素系異能（虛構設定）', ['元素系'], set(range(6))),
 37: ('1db2cff707f0ccfaec98a2275fd006ad2a07e695eb19314c079c1d4865e4a343', 'sunrise-physical-abilities', '曙光市｜身體系異能（虛構設定）', ['身體系'], {1,2,3,4}),
 38: ('4ebe6251aff288281e388d3ed69ac9bae76e3a98ddd93462fa9846c9c2bae5d5', 'sunrise-space-abilities', '曙光市｜空間系異能（虛構設定）', ['空間系'], {0,2}),
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
 0: ('4834e239dddf64bc25c350cf6be0f3fbcabdae936fee9804872f788f11916a63', 'sunrise-city-overview', '曙光市｜城市與社會概況', ['曙光市'], {0,1,2,3,4}),
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
  if sha(content) != digest or content != shared['entries'][index]['content'] or entry['category'] != ('角色' if 8 <= index <= 28 else '事件' if index in (96,97) else '規則' if index in (0, 33, 34, 36, 37, 38, 138) else '地點'):
   raise ValueError('Source changed; review again')
  starts = [m.start() for m in re.finditer(r'^#### ' if index in (36,37,38) else r'^#{2,3} ' if index == 138 else r'^## ' if index in (0, 1, 2, 3, 4, 5, 6) else r'^### ', content, re.M)]
  if not starts or starts[0] != 0: starts.insert(0,0)
  spans = list(zip(starts, starts[1:] + [len(content)]))
  entries, review = [], []
  for part, (start,end) in enumerate(spans):
   value = content[start:end].strip(); title = value.splitlines()[0].lstrip('# ').strip()
   kept = part in allowed
   record = {'chapter':part,**({'title':title} if kept else {}),'start':start,'end':end,'sha256':sha(value),'status':'published' if kept else 'deferred'}
   if index in ALLOWED:
    record['review_lane'] = 'public-reference' if kept else 'withheld-author-source'
    record['requires_further_review'] = not kept
   if kept:
    value, decisions = reconcile_chapter(index, part, value)
    if decisions:
     record['reconciliation'] = decisions
     record['published_sha256'] = sha(value)
    eid = f'sunrise-source-{index}-{part}'; record['entry_id'] = eid
    if index in ALLOWED:
     title = (INSTITUTION_NAMES[part]+'｜公開職務') if index==26 else NAMES[index]+'｜'+('居住背景' if index==28 else '基礎身份' if part==0 else title)
    recall_keywords = {
     (0,2): ['曙光市警力', '曙光市主要勢力'],
     (0,4): ['血色七月', '覺醒潮', '曙光市歷史'],
     (33,0): ['曙光市異能', '異能來源理論'], (33,2): ['異能覺醒'],
     (33,3): ['異能訓練'], (33,4): ['異能限制'], (33,6): ['異能者登記法', '異能者權益', '異能者歧視'],
     (96,0): ['血色七月統計', '血色七月死傷'], (97,1): ['血色七月影響', '登記法強制實施'],
     (36,0): ['冰系異能', '冰霜領域'], (36,1): ['火系異能', '火焰操控'],
     (36,2): ['雷系異能', '雷電操控'], (36,3): ['水系異能', '水流操控'],
     (36,4): ['土系異能', '土石操控'], (36,5): ['風系異能', '空氣操控'],
     (37,1): ['速度強化'], (37,2): ['防禦強化', '皮膚硬化'],
     (37,3): ['再生能力', '斷肢再生'], (37,4): ['感官強化'],
     (38,0): ['瞬移', '空間系異能'], (38,2): ['次元口袋'],
     (34,0): ['異能分類', '八大主類'], (34,4): ['異能監控等級', '異能者管理局監控']
    }.get((index, part), keywords)
    if index==26: recall_keywords=[INSTITUTION_NAMES[part]]
    entries.append({'id':eid,'title':name+'｜'+(keywords[0]+'｜' if 8 <= index <= 28 else '')+title,'category':'人物資料' if 8 <= index <= 28 else '世界資料','mode':'keyword','keywords':recall_keywords + ({1:['曙光金融大廈','天際商場','凱旋企業總部','司法大廈','曙光國際會議中心'],2:['曙光證券交易所','泰坦科技','晨曦集團','極光製藥','銀河傳媒']} .get(part, []) if index == 1 else []),'content':value})
   review.append(record)
  groups = [(pack_id, name, entries)]
  if index == 0:
   history = [e for e in entries if e['id'] == 'sunrise-source-0-4']
   groups = [(pack_id, name, [e for e in entries if e not in history]),
             ('sunrise-history-summary', '曙光市｜歷史時間線（整合摘要）', history)]
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
    packs.append({'schema':'yorubay-worldbook-pack','version':1,'meta':{'id':group_id,'name':group_name,'world':'sunrise-city','classification':'scenario' if group_id.endswith('-scenario') else 'reference' if group_id.endswith('-people') else 'world','author':'班長／肉包','release':'1.1.0','visibility':'public','source':'囚徒的自白原始來源｜失序之城配套採用版（2026-10-11）'},'entries':group_entries})
  mapping.append({'source_index':index,'source_sha256':digest,'source_chars':len(content),'chapters':review})
 return {'packs':packs}, {'source_worldbook_id':original['worldbook']['id'],'shared_content_verified':True,'sources':mapping}
if __name__ == '__main__':
 catalog, mapping = build(sys.argv[1])
 for name, value in [('sunrise-worldbook-library.json',catalog),('sunrise-geography-source-map.json',mapping)]:
  (ROOT/'data'/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
