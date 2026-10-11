"""Public slices of academy, family and venue sources; secrets stay archived."""
import re

ALLOWED = {49:{0,2,3},50:{0},51:{0,2,3,11},53:{0,13,15,16,17,19},54:{1,2,4},
           55:{1,3,4,6,9,12,16,21},56:{1,2,5,6,10,11},57:{0,2,7},59:{2,4,5},60:{10,11,13,14,15}}
LABELS = {
 (49,2):'天璇異能學院｜公開校況',
 (50,0):'蕭家｜基本資訊', (51,0):'蕭家豪宅｜公開格局',
 (51,2):'蕭家｜管理局職務', (51,3):'蕭家｜學院職務', (51,11):'蕭家｜對外形象',
 (53,0):'雷家｜基本資訊', (53,13):'雷家別墅', (53,15):'雷家家訓',
 (53,16):'雷家傳統', (53,17):'雷家教育理念', (53,19):'雷光保全公司',
 (54,1):'雷鳴異能訓練館', (54,2):'雷光武器製造', (54,4):'雷家｜公開機構合作',
 (55,1):'異能者頂層家族', (55,3):'異能者中層家族', (55,4):'異能者下層家族',
 (55,6):'林家｜基本資訊', (55,9):'林氏集團', (55,12):'沈家｜基本資訊',
 (55,16):'蘇家｜基本資訊', (55,21):'陳家｜基本資訊',
 (56,1):'白家｜基本資訊', (56,2):'白家｜醫療事業',
 (56,5):'風家｜基本資訊', (56,6):'風聞情報網',
 (56,10):'岩家｜基本資訊', (56,11):'岩家｜建築事業',
 (57,0):'Rose Club｜公開基本資料', (57,2):'Rose Club｜表面業務', (57,7):'Rose Club｜普通客群',
 (59,2):'紅燈區A區｜高級夜店街', (59,4):'紅燈區C區｜暗巷', (59,5):'紅燈區D區｜黑市街',
 (60,10):'紅燈區｜公共衛生背景', (60,11):'紅燈區｜暴力犯罪背景',
 (60,13):'小櫻失蹤案｜官方說法', (60,14):'五年前人口販賣案｜警方公開結果',
 (60,15):'紅燈區｜血色七月背景'}
KEYWORDS = {key:[label.split('｜')[0]] for key,label in LABELS.items()}
KEYWORDS.update({
 (49,2):['天璇學院校況','學院階級','學院校風'],
 (50,0):['蕭家基本資料','蕭家'], (51,0):['蕭家豪宅','蕭家格局'],
 (51,2):['蕭家管理局職務'], (51,3):['蕭家學院職務'], (51,11):['蕭家對外形象'],
 (53,0):['雷家基本資料','雷家'], (54,4):['雷家公開合作'],
 (55,1):['異能者家族階層','頂層家族'], (55,3):['中層家族'], (55,4):['下層家族'],
 (56,2):['白光醫院','白家醫療'], (56,11):['岩家建築','岩家工程'],
 (57,0):['Rose Club','Club Rose'], (57,2):['Rose Club業務','Rose Club包廂'],
 (57,7):['Rose Club客群'], (59,2):['高級夜店街','繁華街區'],
 (59,4):['暗巷紅燈','紅燈區C區'], (59,5):['黑市街','地下交易區'],
 (60,10):['紅燈區公共衛生','紅燈區檢查站'], (60,11):['紅燈區暴力犯罪'],
 (60,13):['小櫻失蹤案','小櫻官方說法'], (60,14):['五年前人口販賣大案'],
 (60,15):['紅燈區血色七月']})

DECISIONS = {
 'public-place-boundary':{'status':'resolved','authority':[49,51],'affected':[49,51],
  'adopted':'校況與豪宅公開投影不含非法實驗、秘密地下室；家族形象明示為對外展示。',
  'reason':'地點名稱召回不等於玩家已進入、掌握機密或認定宣傳為真。'},
 'family-lineage-projection':{'status':'resolved','authority':[53],'affected':[53],
  'adopted':'雷家基本資料暫不發布三代傳承斷言；公開產業、家訓及場所仍可使用。',
  'reason':'世代敘述與成員、歷史不吻合，不補造缺失世代。'},
 'venue-public-surface':{'status':'resolved','authority':[57],'affected':[57],
  'adopted':'Rose Club公開基本資料只含表面業務及場所資訊，未採店長矛盾年齡與幕後控制者。',
  'reason':'場所召回不能直接揭露控制者、私有業務及人物秘密。'},
 'case-public-report':{'status':'resolved','authority':[60],'affected':[60],
  'adopted':'失蹤案只發布已標官方說法；人口販賣案只發布警方破獲與逮捕結果。',
  'reason':'保留黑暗犯罪世界背景，分離官方版本、幕後真相與人物私有知識。'},
 'rose-club-personnel-ages':{'status':'unresolved','authority':[44,46,57,58],'affected':[44,46,57,58],
  'adopted':None,'reason':'人物檔案的りな25歲、麻美38歲與場所頁23歲、45歲不一致；場所投影不採矛盾年齡，不建立第二個同名人物。'},
 'lei-family-generations':{'status':'unresolved','authority':[53],'affected':[53],
  'adopted':None,'reason':'雷驚雲被列第一代又稱雷震天祖父，歷史還有未列名父親；三代傳承、創立80年前及享年85歲不能直接對齊。'},
 'family-player-template':{'status':'unresolved','authority':[50,'author-mother-draft'],'affected':[50],
  'adopted':None,'reason':'家族名冊指定玩家16歲且是蕭家子女，與作品目前可自訂成年身分的開場不通用。不能由背景召回覆寫玩家設定。'},
 'bai-family-classification':{'status':'unresolved','authority':[55,56],'affected':[55,56],
  'adopted':None,'reason':'家族階層頁稱白家光系，家族專頁以治癒系為主。專頁公開資料保持原文，概覽分類章暫不發布，不擅自把光系等同治癒系。'},
 'redlight-district-location':{'status':'unresolved','authority':[0,59],'affected':[59],
  'adopted':None,'reason':'紅燈區位置標東南區，但城市採五個行政區；方位、跨區商圈或新行政區未定。不改名或新增第六區。'}
}

def chapter_spans(index, content):
 starts=[m.start() for m in re.finditer(r'^#{2,4} ',content,re.M)]
 if not starts or starts[0]!=0:starts.insert(0,0)
 return list(zip(starts,starts[1:]+[len(content)]))

def project(index, part, value):
 if (index,part)==(49,2):
  return value.split('**黑暗面：**')[0].rstrip(),['public-place-boundary']
 if (index,part)==(51,0):
  return re.sub(r'^- \*\*地下室：\*\*[^\n]*\n','',value,flags=re.M),['public-place-boundary']
 if (index,part)==(51,11):
  return '【蕭家對外展示的形象；不代表實際關係已確認】\n'+value,['public-place-boundary']
 if (index,part)==(53,0):
  return re.sub(r'^\*\*世代傳承：\*\*[^\n]*\n','',value,flags=re.M),['family-lineage-projection']
 if (index,part)==(57,0):
  value=value.replace('高級夜店（表面）+ 性產業前線（實際）','高級夜店（表面）')
  value=re.sub(r'^\*\*老闆：\*\*[^\n]*\n','',value,flags=re.M)
  value=value.replace('麻美（45歲，前陪酒女，現管理者）','麻美（店長）')
  return value,['venue-public-surface']
 if (index,part)==(60,13):
  title=value.splitlines()[0]
  victim=value.split('**受害者：**')[1].split('**真相：**')[0]
  victim='\n'.join(line for line in victim.splitlines() if '知道陳大海太多秘密' not in line).strip()
  return '【官方說法；不代表失蹤原因已確認】\n'+title+'\n\n**受害者：**\n'+victim+'\n\n**官方說法：** 自己離職',['case-public-report']
 if (index,part)==(60,14):
  return value.split('**後續：**')[0].rstrip(),['case-public-report']
 return value,[]
