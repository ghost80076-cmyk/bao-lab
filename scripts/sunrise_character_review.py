"""Reviewed public projections; withheld prose stays only in the author archive."""
import re

NAMES = {16:'蕭',17:'林宇軒',18:'雷辰',19:'桃華',20:'星野美月',21:'蘇晴',22:'蕭凜',23:'蕭夜',24:'蕭辰',25:'蕭星',26:'機構人物',27:'阿桃',28:'阿桃'}
ALLOWED = {16:{0,1},17:{0,1,6},18:{0,1,5,6},19:{0,1,6},20:{0,1,6},21:{0,1,6,7},22:{0,6,7,8,9},23:{0,6,7,8,9},24:{0,6,8},25:{0,6,7,8,9},26:set(range(7)),27:{0},28:{2}}
INSTITUTION_NAMES = ['陳天行','李雪梅','王剛','趙明遠','張烈','龍哥','狼王']
KEYWORDS = {16:['異能者管理局副局長','天璇異能學院董事'],17:['林宇軒'],18:['雷辰'],19:['桃華'],20:['星野美月'],21:['蘇晴'],22:['蕭凜'],23:['蕭夜'],24:['蕭辰'],25:['蕭星'],27:['阿桃'],28:['阿桃居住','阿桃住處']}
DECISIONS = {
 'character-public-projection': {'status':'resolved','authority':list(range(16,29)),'affected':list(range(16,29)),
  'adopted':'只提供可核對的身份、外貌、登記能力及生活背景；私有動機、未知身份、隱藏等級與未發生方向留在作者原檔。',
  'reason':'公開參考資料不等於玩家已知、不等於人物在場。來源hash及章節跨度保留以便續作。'},
 'deceased-character-reference': {'status':'resolved','authority':[19],'affected':[19],
  'adopted':'已故人物的能力資料標示為生前資料，不建立現存人物或本輪能力使用。','reason':'避免召回能力章節後把已故人物當成在場人物。'},
 'family-age-chain': {'status':'unresolved','authority':[16,19,20,21,22,23,24,25,50],'affected':[16,19,20,21,22,23,24,25,50],
  'adopted':None,'reason':'來源20：37歲、20歲首次生育與16歲兒子的年齡不能直接吻合；来源21：38歲、21歲生女與15歲女兒不吻合；來源19：享年36歲且兩年前去世、19／20歲生女，须與子女當前年齡交叉核對。不擅改年齡、不假設另有未記錄子女。'},
 'wolf-leader-version': {'status':'unresolved','authority':[26,40,113,139],'affected':[26,40,113,139],
  'adopted':None,'reason':'來源26為38歲／S級、113為35歲左右、139為35歲／SS級；未有時間或偽裝依據，公開人物投影暫只保留職務與反登記法立場。'},
 'thunder-rank-version': {'status':'resolved','authority':[18,33,36,53],'affected':[18,76],
  'adopted':'雷辰登記等級採S級；能力成長、戰鬥結果另依已確認事件。','reason':'完整人物與三份分類／家族資料一致；來源76的A級比較不能覆寫登記等級。'},
 'incomplete-institution-person': {'status':'unresolved','authority':[26],'affected':[26],
  'adopted':None,'reason':'來源26末章只有職務與姓名標題，沒有人物正文；不杜撰年齡、能力或經歷。'},
 'memory-identity-timeline': {'status':'unresolved','authority':[19,27,28],'affected':[19,27,28],
  'adopted':None,'reason':'已故時間與另一人物的既有年齡、記憶覺醒時間未形成一致年表；先保留分開的公開身份，不擅自新增世界規則解釋。'}
}

def project(index, part, value):
 if index not in ALLOWED or part not in ALLOWED[index]:
  return value, []
 ids=[]
 if index==17 and part==0:
  value=value.replace('/表面教師暗中支持反登記法組織','')
  ids.append('character-public-projection')
 if index==17 and part==1:
  value=value.replace('左肩刀疤(被蕭的人傷)','左肩刀疤(來源尚未公開)')
  ids.append('character-public-projection')
 if index==24 and part==6:
  value=value.replace('(實際可能B級隱藏實力)','')
  ids.append('character-public-projection')
 if index==19 and part==6:
  value='【已故人物的生前能力資料；不代表現在在場或仍可行動】\n'+value
  ids.append('deceased-character-reference')
 if index==26:
  heading, body=value.split('\n',1)
  parts=body.strip().split('/')
  # Fixed reviewed field counts, not a generic secret-removal heuristic.
  count={0:3,1:3,2:3,3:3,4:3,5:3,6:3}[part]
  body='/'.join(parts[:count])
  for old,new in [('學院掌權者和蕭盟友','學院掌權者'),('校長左右手和蕭關係複雜','校長左右手'),('管理局最高領導蕭上司','管理局最高領導'),('蘇晴同事競爭對手','蘇晴同事'),('三合會老大和蕭秘密交易','三合會老大')]:
   body=body.replace(old,new)
  if part==6:
   body='狼幫老大／反登記法；年齡與異能等級版本待核。'
  value=heading+'\n'+body
  ids.append('wolf-leader-version' if part==6 else 'character-public-projection')
 if index==28 and part==2:
  match=re.search(r'^出身:[^\n]*',value,re.M)
  if not match:raise ValueError('Missing reviewed residence paragraph')
  value='### 【居住背景】\n'+match.group()
  ids.append('character-public-projection')
 return value,ids
