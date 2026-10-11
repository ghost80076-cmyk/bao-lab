"""Institution data and public character projections, never automatic case results."""
import re

NAMES={61:'Aletheia（阿蕾西亞）',68:'黑羽璃夜',70:'神代隼人',72:'清水純',75:'炎月夜'}
ALIASES={61:['Aletheia','阿蕾西亞'],68:['黑羽璃夜','璃夜','Riya Kuroha'],
         70:['神代隼人','Hayato Kamishiro'],72:['清水純'],75:['炎月夜','Homura Tsukiyo']}
ALLOWED={61:{0,1,2,6,7},62:{1},63:{0,2,3,4,6,7},64:{0,2,3},66:{0,2,3,4},67:{5},
         68:{0,1,2,6,7},70:{0,1,2,6},72:{0,1,2,6},73:{0},75:{0,1,2}}
LABELS={(62,1):'煉律審查部門｜公開職務', (63,0):'煉律審查系統｜基本資料',
 (63,2):'煉律審查｜申請提交', (63,3):'煉律審查｜面談流程', (63,4):'煉律審查｜裁定種類',
 (63,6):'煉律審查｜制度標準', (63,7):'煉律審查｜通過案例示例',
 (64,0):'煉律審查｜拒絕案例示例', (64,2):'煉律審查｜裁定與保密權',
 (64,3):'煉律審查｜執行權限制', (66,0):'Velvet Eclipse｜公開基本資料',
 (66,2):'Velvet Eclipse｜會員制度', (66,3):'Velvet Eclipse｜表面服務',
 (66,4):'Velvet Eclipse｜對外規則', (67,5):'Velvet Eclipse｜公開會員事件',
 (73,0):'清水純｜目前戰鬥能力'}
KEYWORDS={(62,1):['煉律審查部門職務','煉律審查室'],
 (63,0):['煉律審查系統','Veritas'], (63,2):['煉律審查申請','煉律申請'],
 (63,3):['煉律面談','煉律審查室'], (63,4):['煉律裁定','煉律審查結果'],
 (63,6):['煉律審查標準'], (63,7):['煉律通過案例'], (64,0):['煉律拒絕案例'],
 (64,2):['煉律審查權力','煉律保密權'], (64,3):['煉律執行權'],
 (66,0):['Velvet Eclipse','天鵝絨月蝕'], (66,2):['Velvet Eclipse會員','天鵝絨月蝕會員'],
 (66,3):['Velvet Eclipse服務'], (66,4):['Velvet Eclipse規則'], (67,5):['Velvet Eclipse會員事件'],
 (73,0):['清水純戰鬥','清水純水盾']}

DECISIONS={
 'veritas-institution-reference':{'status':'resolved','authority':[62,63,64],'affected':[62,63,64],
  'adopted':'煉律流程、標準與案例作為虛構制度參考，案例明示為示例，不代表本輪已申請或裁定。',
  'reason':'世界內審查制度不同於平台或模型權限；不新增前端審查引擎，也不因召回自動簽發許可。'},
 'veritas-public-scope':{'status':'resolved','authority':[64],'affected':[64],
  'adopted':'公開裁定、保密權及不能直接逮捕處決的職權界線；政治私有動機和矛盾的監控段另留來源。',
  'reason':'權限查詢不直接提供蕭與審查官的私有立場或未定觸發方式。'},
 'velvet-public-surface':{'status':'resolved','authority':[66,67],'affected':[66,67],
  'adopted':'場所基本頁與對外規則移除未確定幕後投資者及保護費；公開流傳會員事件保留歷史歸因。',
  'reason':'預約條件和場所氣氛可用於故事，不能由場所名直接揭露黑幕或強制觸發歷史事件。'},
 'professional-public-projections':{'status':'resolved','authority':list(NAMES),'affected':list(NAMES),
  'adopted':'保留外在身分與言行，私有動機另留來源；璃夜只發布夜間工作投影，不連接白天身分。',
  'reason':'角色名稱召回不自動揭露控制關係、雙重身分、親密台詞或人物已在場。'},
 'character-current-abilities':{'status':'resolved','authority':[61,72,73],'affected':[61,72,73],
  'adopted':'發布目前已登記能力與限制，清水純維持B級，覺醒經歷與未發現S級潛力不入公開投影。',
  'reason':'未來可能突破不等於當前技能、實戰結果或已獲得等級；真實之眼仍受直視、疲勞與未知真相限制。'},
 'casting-reference-separation':{'status':'resolved','authority':[72,75],'affected':[72,75],
  'adopted':'演員參考保留於作者原檔；公開人物身分與外貌不附真人演員名稱。',
  'reason':'作者選角提示不是世界內人物身分；保留原本五官、髮型、服裝與人物差異。'},
 'veritas-review-invocation':{'status':'unresolved','authority':[63,64,65],'affected':[63,64,65],
  'adopted':None,'reason':'申請流程包括強制審查，限制頁稱只有主動申請，劇情頁又有主動召喚；強制送審、傳喚與主動申請的權限關係未定。'},
 'veritas-earliest-case-age':{'status':'unresolved','authority':[61,64],'affected':[64],
  'adopted':None,'reason':'阿蕾西亞現年24歲，背景20歲任職，五年前案例卻已由她裁定。歷史案例不發布，不擅改人物年齡或增設實習裁定例外。'},
 'velvet-client-overlap':{'status':'unresolved','authority':[57,59,66],'affected':[66],
  'adopted':None,'reason':'會所稱客群不與Rose Club重疊，但人物記述有同一客人出入兩處；Rose Club消費級距也不同。比較章暫不採用，不補造區隔。'},
 'water-ability-uniqueness':{'status':'unresolved','authority':[36,55,72,73,74],'affected':[73,74],
  'adopted':None,'reason':'清水純整合頁稱唯一已登記水系者，已有水系分類及沈家水系人物。保留她目前B級設定，不發布唯一斷言或編造未登記例外。'}
}

def chapter_spans(index,content):
 starts=[m.start() for m in re.finditer(r'^#{2,4} ',content,re.M)]
 if not starts or starts[0]!=0:starts.insert(0,0)
 return list(zip(starts,starts[1:]+[len(content)]))

def public_voice(index,value):
 lines=value.splitlines()
 if index==68:
  surface=next(l for l in lines if l.startswith('表面(晚上):'))
  phrase=next(l for l in lines if l.startswith('口頭禪:')).split('晚上',1)[1].split('親密時',1)[0].strip()
  return '### 【夜間公開言行】\n'+surface+'\n口頭禪(晚上):'+phrase
 surface=next(l for l in lines if l.startswith('表面:'))
 phrase=next(l for l in lines if l.startswith('口頭禪:'))
 if index==70:phrase=phrase.split('真實變態',1)[0].strip()
 if index==75:phrase=phrase.replace('(其實在關心)','')
 return '### 【表面言行與口頭禪】\n'+surface+'\n'+phrase

def project(index,part,value):
 ids=[]
 if index in NAMES and part==2:
  return public_voice(index,value),['professional-public-projections']
 if (index,part)==(68,0):
  value=value.replace('自由攝影師(白天)+Velvet Eclipse頭牌兔女郎(晚上)/被丈夫控制','Velvet Eclipse頭牌兔女郎(夜間工作)')
  ids.append('professional-public-projections')
 if (index,part)==(68,1):
  lines=[]
  for line in value.splitlines():
   if line.startswith(('氣質:','穿著:','印象:')):line=line.split(':',1)[0]+':'+line.split('晚上',1)[1]
   lines.append(line)
  value='【夜間工作外貌投影】\n'+'\n'.join(lines)
  ids.append('professional-public-projections')
 if (index,part)==(70,0):
  value=value.replace('/控制狂變態丈夫','');ids.append('professional-public-projections')
 if (index,part)==(70,1):
  value=value.replace('實則陰險冷酷','');ids.append('professional-public-projections')
 if index in (72,75) and part in (0,1):
  value=re.sub(r'^演員參考:[^\n]*\n?','',value,flags=re.M)
  value=re.sub(r'\(參考(?:橋本環奈|北川景子)\)','',value)
  ids.append('casting-reference-separation')
 if (index,part) in [(61,6),(72,6)]:
  value=re.sub(r'^覺醒:[^\n]*\n?','',value,flags=re.M)
  if index==72:value=re.sub(r'^成長潛力:[^\n]*\n?','',value,flags=re.M)
  ids.append('character-current-abilities')
 if (index,part)==(73,0):
  value=re.sub(r'^危險度:[^\n]*','危險度:★★☆☆☆',value,flags=re.M)
  ids.append('character-current-abilities')
 if (index,part)==(63,0):
  value=value.replace('血色七月後3個月（10年前）','血色七月後3個月（相對故事開場為14年9個月前）')
  value=re.sub(r'^\*\*成立原因：\*\*[^\n]*\n','',value,flags=re.M)
  ids.extend(['bloody-july-date','bloody-july-cause'])
 if (index,part)==(64,2):
  value=value.replace('- 但實際上蕭一直想控制審查系統','')
  ids.append('veritas-public-scope')
 if (index,part)==(64,3):
  value=value.split('**無法監控所有人：**')[0].rstrip()
  ids.append('veritas-public-scope')
 if index in (63,64) and part in ALLOWED[index]:
  prefix='【虛構制度案例示例；不代表本輪已裁定】' if (index,part) in [(63,7),(64,0)] else '【虛構制度參考；不代表本輪已申請或裁定】'
  value=prefix+'\n'+value;ids.append('veritas-institution-reference')
 if (index,part)==(66,0):
  value=value.replace('高級私人會所（表面）+ 灰色產業（實際）','高級私人會所（表面）')
  value=re.sub(r'^\*\*老闆：\*\*[^\n]*\n','',value,flags=re.M)
  ids.append('velvet-public-surface')
 if (index,part)==(66,4):
  value=value.replace('- 與警方有「默契」（繳保護費）','');ids.append('velvet-public-surface')
 if (index,part)==(67,5):
  value='【公開流傳的歷史事件；不是本輪新發生的事件】\n'+value;ids.append('velvet-public-surface')
 return value,ids
