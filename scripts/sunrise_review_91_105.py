"""Public projections for sources 91–105; secrets, coercive methods and unsafe plots stay withheld."""
import re

NAMES={91:'林月影',92:'張皓',94:'陳國輝',95:'艾莉絲·溫特'}
ALIASES={91:['林月影'],92:['張皓','觸鬚'],94:['陳國輝','章魚','老陳'],95:['艾莉絲·溫特','Alice Winter']}
ALLOWED={91:{0,1,2,4,5,6,7,9},92:{0,1,2},93:set(),94:{0,1,2,4,5,6,7,9},95:{0,1,4,5,6},100:set(),102:{1,2,4},103:set(),105:{1,2,4}}
LABELS={(91,0):'林月影｜公開基本資料',(91,1):'林月影｜公開外貌',(91,2):'林月影｜公開性格',(91,4):'林月影｜登記能力',(91,5):'林月影｜公開戰鬥概況',(91,6):'林月影｜公開資源',(91,7):'林月影｜公開社交',(91,9):'林月影｜公開技能',(92,0):'張皓｜公開基本資料',(92,1):'張皓｜公開外貌',(92,2):'張皓｜公開性格',(94,0):'陳國輝｜公開基本資料',(94,1):'陳國輝｜公開外貌',(94,2):'陳國輝｜公開性格',(94,4):'陳國輝｜登記能力',(94,5):'陳國輝｜公開戰鬥概況',(94,6):'陳國輝｜公開資源',(94,7):'陳國輝｜公開社交',(94,9):'陳國輝｜公開技能',(95,0):'艾莉絲·溫特｜公開基本資料',(95,1):'艾莉絲·溫特｜公開外貌',(95,4):'艾莉絲·溫特｜登記能力',(95,5):'艾莉絲·溫特｜公開資源',(95,6):'艾莉絲·溫特｜公開社交',(102,1):'東區平民區｜過渡區',(102,2):'東區平民區｜社會結構',(102,4):'東區平民區｜區域關係',(105,1):'南區｜過渡區',(105,2):'南區｜社會結構',(105,4):'南區｜區域關係'}
KEYWORDS={k:[v.split('｜')[0]] for k,v in LABELS.items()}
KEYWORDS.update({(91,0):['林月影','黑市醫生'],(92,0):['張皓','觸鬚'],(94,0):['陳國輝','章魚','港口碼頭'],(95,0):['艾莉絲·溫特','Alice Winter'],(102,1):['東區過渡區','東區與CBD交界'],(105,1):['南區過渡區','南區與東區交界']})
DECISIONS={'medical-public-boundary':{'status':'resolved','authority':[91],'affected':[91],'adopted':'公開林月影的獨立診療身分與已登記醫療能力；未公開攻擊能力、創傷與黑幫私下關係。','reason':'醫療支援可作世界背景，但角色秘密不能由診所名稱直接揭露。'},'touch-ability-safety-scope':{'status':'resolved','authority':[91,92,94,95],'affected':[91,92,94,95],'adopted':'能力只發布目前登記、非操作性摘要；刑訊、侵入神經、人體實驗與控制方法不公開。','reason':'保留觸手系異能的世界觀辨識度，移除可直接模仿的傷害流程與強制控制細節。'},'source93-withheld':{'status':'resolved','authority':[93],'affected':[93],'adopted':'蘇夢來源整筆保留作者原檔，不公開性化、非法實驗、綁架與融合情節。','reason':'單一來源同時含性化、未成年時期暴力與人體實驗內容，無法在本批安全拆成公開投影。'},'district-public-structure':{'status':'resolved','authority':[102,105],'affected':[102,105],'adopted':'發布過渡區、社會結構與區域關係；犯罪劇情、人口販運、毒品製造、器官買賣與兒童剝削段落留待審核。','reason':'地理資料可支援模擬世界，但黑暗劇情不能由普通地名召回。'},'source100-103-scenarios-withheld':{'status':'resolved','authority':[100,103],'affected':[100,103],'adopted':'北山與東區劇情線、關鍵NPC及犯罪調查先不發布。','reason':'劇情線含未定幕後真相、人口販運與非法實驗；保留來源跨度與 hash。'},'touch-research-authority':{'status':'unresolved','authority':[91,92,93,95,96,100,103],'affected':[91,95],'adopted':None,'reason':'觸手系角色、源點計畫、管理局研究與北山／東區劇情線的控制關係尚未有一致公開版本。'}}
def chapter_spans(index,content):
 starts=[m.start() for m in re.finditer(r'^#{2,4} ',content,re.M)]
 if not starts or starts[0]!=0: starts.insert(0,0)
 return list(zip(starts,starts[1:]+[len(content)]))
def strip_actor(value): return re.sub(r'^演員參考:[^\n]*\n?','',value,flags=re.M)
def project(index,part,value):
 ids=[]
 if index in (91,92,94,95) and part in (0,1): value=strip_actor(value); ids+=['casting-reference-separation']
 if index==91 and part==0: value=value.replace('黑市醫生','獨立醫生').replace('與三合會有合作','與不同勢力保持工作距離'); ids+=['medical-public-boundary']
 if index==91 and part==1: value=value.replace('私下遮掩觸手痕跡','工作服與長袖衣物'); ids+=['medical-public-boundary']
 if index==91 and part==2: value='### 【公開性格】\n'+next((l for l in value.splitlines() if l.startswith('表面:')),'')+'\n'+next((l for l in value.splitlines() if l.startswith('標籤:')),''); ids+=['medical-public-boundary']
 if index==91 and part==4:
  value='### 【登記能力】\n醫療支援型異能，具備公開登記的傷口縫合與止血用途；實際範圍、限制與未公開能力不在本投影中。'; ids+=['touch-ability-safety-scope']
 if index==91 and part==5: value='### 【公開戰鬥概況】\n醫療支援為主，避免主動衝突。'; ids+=['touch-ability-safety-scope']
 if index==91 and part==7: value=re.sub(r'三合會[^\n]*狼幫[^\n]*','不同勢力的傷患都可能尋求治療',value); ids+=['medical-public-boundary']
 if index==91 and part==9: value='### 【公開技能】\n'+next((l for l in value.splitlines() if l.startswith('技能')),''); ids+=['medical-public-boundary']
 if index==92 and part==0: value=value.replace('三合會刑訊專家','三合會核心成員').replace('刑訊專家','危險人物'); ids+=['touch-ability-safety-scope']
 if index==92 and part==1: value=value.replace('實為觸手巢穴','具有觸手系異能特徵').replace('印象危險的刑訊專家','印象危險的幫派人物'); ids+=['touch-ability-safety-scope']
 if index==92 and part==2: value='### 【公開性格】\n'+next((l for l in value.splitlines() if l.startswith('表面:')),''); ids+=['touch-ability-safety-scope']
 if index==94 and part==0: value=value.replace('表面走私頭目實際','港口工人，與港口灰色勢力有接觸').replace('/三合會外圍成員',''); ids+=['medical-public-boundary']
 if index==94 and part==2: value='### 【公開性格】\n'+next((l for l in value.splitlines() if l.startswith('表面:')),'')+'\n'+next((l for l in value.splitlines() if l.startswith('標籤:')),''); ids+=['medical-public-boundary']
 if index==94 and part==4: value=re.sub(r'^覺醒:[^\n]*\n?','',value,flags=re.M); value=re.sub(r'^潛力:[^\n]*\n?','',value,flags=re.M); ids+=['touch-ability-safety-scope']
 if index==94 and part==5: value='### 【公開戰鬥概況】\n非戰鬥型搬運異能，危險度低。'; ids+=['touch-ability-safety-scope']
 if index==94 and part==6: value='### 【公開資源】\n碼頭工作與搬運能力；其他資金與私人物品不公開。'; ids+=['medical-public-boundary']
 if index==94 and part==7: value='### 【公開社交】\n在港口工業區與碼頭工作，與不同工人和勢力保持謹慎往來。'; ids+=['medical-public-boundary']
 if index==94 and part==9: value='### 【公開技能】\n搬運、碼頭工作、基礎情報與人際協調。'; ids+=['medical-public-boundary']
 if index==95 and part==0: value=value.replace('秘密組織「源點計畫」領導者','政府研究部門首席研究員').replace('政府表面源點計畫實際','政府研究計畫公開職務'); ids+=['touch-ability-safety-scope']
 if index==95 and part==4: value='### 【登記能力】\n研究用途的心靈與身體系異能，已完成官方登記；公開檔案只保留職業相關的概括描述，不公開控制、侵入或催化方法。'; ids+=['touch-ability-safety-scope']
 if index==95 and part==5: value='### 【公開資源】\n政府研究職務與正式研究設施；其他資源不公開。'; ids+=['touch-ability-safety-scope']
 if index==95 and part==6: value='### 【公開社交】\n在管理局研究體系內工作，對外保持專業距離。'; ids+=['touch-ability-safety-scope']
 if index in (102,105) and part in (1,2,4): ids+=['district-public-structure']
 if index==102 and part==1: value=re.sub(r'治安較好（因接近 CBD）','治安相對穩定（因接近 CBD）',value)
 if index==102 and part==2: value=re.sub(r'部分居民找黑市醫生（如林月影）','部分居民依賴非正式醫療資源',value).replace('性工作者','服務業工作者')
 if index==102 and part==4: value=re.sub(r'\n\*\*與紅燈區\*\*[\s\S]*?\n\*\*與天璇','\n**與天璇',value)
 if index==105 and part==1: value=re.sub(r'治安仍差，夜晚不敢出門','治安仍差，夜間活動有限',value)
 if index==105 and part==2: value=re.sub(r'主要收入來源：拾荒、打零工、犯罪、賣淫','主要收入來源：拾荒與零工',value).replace('性工作者','服務業工作者')
 if index==105 and part==4: value=re.sub(r'\n\*\*與紅燈區\*\*[\s\S]*','',value).rstrip(); value=re.sub(r'\n\*\*與中央商業區\*\*[\s\S]*','',value).rstrip()
 return value,ids
