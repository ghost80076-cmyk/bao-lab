"""Source-specific decisions for case records, ability references and night-life NPCs."""
import re

NAMES={43:'黑羽 ゆめ',44:'桜井 りな',45:'あいり',46:'高橋 麻美',47:'琉星',48:'田中 美咲'}
ALLOWED={29:{0},35:{0,2},39:{1,2,3,4},40:{2,3,4},41:{0,1,4,5},42:{0,2,3,4,6,7},43:{0,1,2},44:{0,1,2,6,7},45:{0,1,2,6},46:{0,1,2,6},47:{0,1,2,6,7},48:{0,1,2,6,7}}
KEYWORDS={43:['黑羽 ゆめ','黑羽ゆめ','Kuroha Yume','ゆめ'],44:['桜井 りな','桜井りな','Sakurai Rina','りな'],45:['あいり'],46:['高橋 麻美','高橋麻美','麻美媽媽'],47:['琉星','Ryusei'],48:['田中 美咲','田中美咲','美咲']}
CHAPTER_KEYWORDS={
 (29,0):['桃華官方死因','桃華官方紀錄','桃華死亡報導','桃華異能事故'],
 (33,1):['異能官方分級','異能等級'],
 (35,0):['心靈感應型','心靈感應異能'],(35,2):['精神攻擊型','精神攻擊異能'],
 (39,1):['毒系異能','Poison'],(39,2):['疾病操控型','疾病操控異能'],(39,3):['寄生型異能','寄生異能'],(39,4):['血液操控型','血液操控異能'],
 (40,2):['形態變化型','形態變化異能'],(40,3):['巨大化型','巨大化異能'],(40,4):['液化型','液化異能'],
 (41,0):['金屬操控型','金屬操控異能'],(41,1):['重力操控型','重力操控異能'],(41,4):['反異能型','反異能力場'],(41,5):['吸收型異能','吸收異能'],
 (42,0):['禁忌異能官方定義'],(42,2):['靈魂操控型','靈魂操控異能'],(42,3):['生命汲取型','生命汲取異能'],(42,4):['屍體操控型','屍體操控異能'],(42,6):['痛苦放大型','痛苦放大異能'],(42,7):['精神污染型','精神污染異能']}
DECISIONS={
 'official-case-attribution':{'status':'resolved','authority':[29],'affected':[29],
  'adopted':'官方說法、報案、鑑定及媒體報導保留來源標示；不是死因已獲證實。',
  'reason':'只發布官方紀錄，移除沒有公開來源的特定人物內心立場；時間相對故事開場。'},
 'ability-rank-reference':{'status':'resolved','authority':[33],'affected':[33],
  'adopted':'D至SSS分級定義獨立召回，代表人物另由人物資料提供。',
  'reason':'能力分類不能藉代表名單直接揭露未登記人物或推斷人物在場。'},
 'nightlife-public-persona':{'status':'resolved','authority':list(range(43,49)),'affected':list(range(43,49)),
  'adopted':'表面言行與口頭禪獨立提供，真實動機、私有診斷、創傷及劇情另留原始來源。',
  'reason':'保留人物外在差異，不因名字召回就把角色秘密送入公開資料。'},
 'case-exclusive-variants':{'status':'unresolved','authority':[29,30],'affected':[29,30],
  'adopted':None,'reason':'四個真相版本互斥，尚未選定。不能合併為四件已發生事實，也不能從提問自動選定。'},
 'rebirth-body-timeline':{'status':'unresolved','authority':[19,27,28,31,32],'affected':[19,27,28,31,32],
  'adopted':None,'reason':'一般規則要求死亡後進入新生兒／嬰兒；既有案例年齡與死亡時間不能吻合。不改原始年齡，也不補造例外機制。'},
 'absolute-space-cutting':{'status':'unresolved','authority':[38],'affected':[38],
  'adopted':None,'reason':'原文無法防禦沒有範圍、代價或抗衡條件，不足以作程式必勝判定。該章仍待作品規則整合。'},
 'nightlife-geography':{'status':'unresolved','authority':list(range(43,49)),'affected':list(range(43,49)),
  'adopted':None,'reason':'原始人物住處使用中野、新宿、六本木，與曙光市五區的關係未定。保留原檔，不擅改地名或編造新行政區。'}
}

def project(index,part,value):
 if (index,part)==(29,0):
  value=value.replace('**時間：** 2年前，桃華36歲','**時間：** 故事開場基準的2年前，桃華36歲')
  value=value.replace('- 林宇軒從一開始就不相信\n','')
  return '【公開紀錄中的官方說法；不代表事件真相已確認】\n'+value,['official-case-attribution']
 if (index,part)==(33,1):
  value=re.sub(r'^- 代表：[^\n]*\n?','',value,flags=re.M)
  return value,['ability-rank-reference']
 if index in NAMES and part==2:
  lines=[line for line in value.splitlines() if line.startswith('- **表面**：') or line.startswith('- **口頭禪**：')]
  if len(lines)!=2:raise ValueError('Unexpected public voice source')
  return '## 【表面言行與口頭禪】\n'+'\n'.join(lines),['nightlife-public-persona']
 return value,[]

def chapter_spans(index,content):
 pattern=r'^#{2,3} ' if index in NAMES else r'^#### ' if index in (35,36,37,38,39,40,41,42) else r'^### '
 starts=[m.start() for m in re.finditer(pattern,content,re.M)]
 if not starts or starts[0]!=0:starts.insert(0,0)
 return list(zip(starts,starts[1:]+[len(content)]))
