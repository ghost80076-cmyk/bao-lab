"""Public projections for source indices 76–90; private and unsafe material stays withheld."""
import re

NAMES={77:'影月璃',84:'沈妤筠',85:'蘇逸辰',86:'監獄相關人物',87:'林婉如'}
ALIASES={77:['影月璃','璃夜','Riya Kuroha'],84:['沈妤筠'],85:['蘇逸辰'],86:['陳若琳','監獄心理諮商師'],87:['林婉如']}
ALLOWED={76:{0,1,2,5},77:{0,1,2,4,7,10},78:set(),79:set(),80:set(),81:set(),82:set(),83:set(),84:{0,1,2,4,5,6,7,9},85:{0,1,2,4,5,6,7,9},86:{0,1,2,3,7,8,9,10,12,14},87:{0,1,2,4,5,6},88:{0,1,2},89:{0,3,4},90:set()}
LABELS={(76,0):'炎月夜｜目前異能',(76,1):'炎月夜｜公開戰鬥概況',(76,2):'炎月夜｜公開社交',(76,5):'炎月夜｜曙光市公開整合',(77,0):'影月璃｜公開基本資料',(77,1):'影月璃｜公開外貌',(77,2):'影月璃｜表面言行',(77,4):'影月璃｜登記能力投影',(77,7):'影月璃｜公開社交',(77,10):'影月璃｜曙光市公開整合',(84,0):'沈妤筠｜公開基本資料',(84,1):'沈妤筠｜公開外貌',(84,2):'沈妤筠｜表面言行',(84,4):'沈妤筠｜登記能力',(84,5):'沈妤筠｜公開戰鬥概況',(84,6):'沈妤筠｜公開資源',(84,7):'沈妤筠｜公開社交',(84,9):'沈妤筠｜公開技能',(85,0):'蘇逸辰｜公開基本資料',(85,1):'蘇逸辰｜公開外貌',(85,2):'蘇逸辰｜表面言行',(85,4):'蘇逸辰｜登記能力',(85,5):'蘇逸辰｜公開戰鬥概況',(85,6):'蘇逸辰｜公開資源',(85,7):'蘇逸辰｜公開社交',(85,9):'蘇逸辰｜公開技能',(86,0):'監獄霸凌群體｜公開基本資料',(86,1):'監獄霸凌群體｜公開外貌',(86,2):'監獄霸凌群體｜公開性格',(86,3):'監獄霸凌群體｜公開能力',(86,7):'陳若琳｜公開基本資料',(86,8):'陳若琳｜公開基本身份',(86,9):'陳若琳｜公開外貌',(86,10):'陳若琳｜公開性格',(86,12):'陳若琳｜登記能力',(86,14):'陳若琳｜公開技能',(87,0):'林婉如｜公開基本資料',(87,1):'林婉如｜公開外貌',(87,2):'林婉如｜公開性格',(87,4):'林婉如｜未登記能力',(87,5):'林婉如｜公開劇情定位',(87,6):'林婉如｜公開關係',(88,0):'伊甸園科技體驗館｜基本資料',(88,1):'伊甸園科技體驗館｜建築結構',(88,2):'伊甸園科技體驗館｜合法業務',(89,0):'NS3｜技術與安全摘要',(89,3):'NS3｜技術風險',(89,4):'NS3｜異能者風險摘要'}
KEYWORDS={k:[v.split('｜')[0]] for k,v in LABELS.items()}
KEYWORDS.update({(76,0):['炎月夜異能','烈焰之拳'],(77,0):['影月璃','璃夜'],(77,4):['影月璃能力','影之舞者'],(84,0):['沈妤筠'],(85,0):['蘇逸辰'],(86,7):['陳若琳','監獄心理諮商師'],(87,0):['林婉如'],(88,0):['伊甸園科技體驗館','Eden'],(89,0):['NS3','神經連接技術']})
DECISIONS={'professional-ability-scope':{'status':'resolved','authority':[75,76,77,84,85],'affected':[75,76,77,84,85],'adopted':'公開目前登記能力與限制；未公開隱藏等級、未來突破、私有創傷及親密操控。','reason':'能力投影服務於當前世界互動，不把秘密潛力或劇情結果當成已知事實。'},'minor-source-withheld':{'status':'resolved','authority':[78,79,80,81,82,83],'affected':[78,79,80,81,82,83],'adopted':'含未成年角色的性化、剝削與犯罪劇情來源整批保留作者原檔，不進公開世界書。','reason':'避免公開召回未成年私密與性化內容；後續若需整理，只能另行做非性化、公共背景摘要。'},'prison-public-boundary':{'status':'resolved','authority':[84,85,86,87],'affected':[84,85,86,87],'adopted':'公開職務、登記能力與場所中的表面關係；霸凌設局、私密互動、操控與證據留待審核。','reason':'監獄角色名稱不能自動揭露未證實的犯罪內幕或私密關係。'},'eden-public-surface':{'status':'resolved','authority':[88,89,90],'affected':[88,89,90],'adopted':'公開伊甸園建築與合法服務，NS3只呈現高層技術與安全風險；灰色流程、收費與控制性細節不發布。','reason':'場所可作情境背景，但操作性或強制性技術細節不應由普通召回直接提供。'},'prison-relationship-consistency':{'status':'unresolved','authority':[84,85,86,87,119,120],'affected':[84,85,86,87],'adopted':None,'reason':'沈妤筠、蘇逸辰、霸凌群體與陳若琳的公開職務、私下關係及監獄制度仍有交疊，未確定哪一層是玩家可知事實。'},'ns3-origin-and-authority':{'status':'unresolved','authority':[88,89,90,96,107],'affected':[88,89,90],'adopted':None,'reason':'NS3來源可能是管理局流出或地下研發；不把可能來源、警方腐敗或特異對策課調查寫成已證實事件。'}}
def chapter_spans(index,content):
 starts=[m.start() for m in re.finditer(r'^#{2,4} ',content,re.M)]
 if not starts or starts[0]!=0: starts.insert(0,0)
 return list(zip(starts,starts[1:]+[len(content)]))
def strip_actor(value): return re.sub(r'^演員參考:[^\n]*\n?','',value,flags=re.M)
def project(index,part,value):
 ids=[]
 if index==76 and part==0: value=re.sub(r'^覺醒:[^\n]*\n?','',value,flags=re.M); value=re.sub(r'^成長潛力:[^\n]*\n?','',value,flags=re.M); ids+=['professional-ability-scope']
 if index==76 and part==1: ids+=['professional-ability-scope']
 if index==76 and part==2: value='### 【公開社交】\n'+value.split('### **【劇情】**')[0].rstrip(); ids+=['professional-ability-scope']
 if index==76 and part==5: value=value.split('**火系異能在曙光市:**',1)[-1]; ids+=['professional-ability-scope']
 if index==77 and part in (0,1): value=strip_actor(value).replace('暗影系S級(隱藏為B級)','暗影系已登記B級').replace('穿著剪裁大膽深V露背黑紫銀色調','穿著黑紫銀色調的夜間工作服'); ids+=['casting-reference-separation','professional-ability-scope']
 if index==77 and part==2: value='### 【公開表面言行】\n'+next((l for l in value.splitlines() if l.startswith('表面:')),'')+'\n'+next((l for l in value.splitlines() if l.startswith('口頭禪:')),''); ids+=['professional-ability-scope']
 if index==77 and part==4: value=re.sub(r'\(隱藏為B級\)','',value); value=re.sub(r'^覺醒:[^\n]*\n?','',value,flags=re.M); value=re.sub(r'^潛力:[^\n]*\n?','',value,flags=re.M); value=re.sub(r'影子吞噬\([^\n]*','影子吞噬（登記資料未公開細節）',value); ids+=['professional-ability-scope']
 if index in (84,85,87) and part in (0,1): value=strip_actor(value); ids+=['casting-reference-separation']
 if index==86 and part in (7,8,9): value=strip_actor(value); ids+=['casting-reference-separation']
 if index in (84,85) and part==2: value='### 【公開表面言行】\n'+next((l for l in value.splitlines() if l.startswith('表面:')),''); ids+=['prison-public-boundary']
 if index in (84,85) and part==4: value=re.sub(r'^覺醒:[^\n]*\n?','',value,flags=re.M); value=re.sub(r'^潛力:[^\n]*\n?','',value,flags=re.M); ids+=['professional-ability-scope']
 if index in (84,85) and part==9:
  value='### 【公開技能】\n'+next((l for l in value.splitlines() if l.startswith('技能')),''); ids+=['prison-public-boundary']
 if index==86 and part==10: value='### 【公開性格】\n'+next((l for l in value.splitlines() if l.startswith('表面:')),''); ids+=['prison-public-boundary']
 if index==86 and part==12: value=re.sub(r'^覺醒:[^\n]*\n?','',value,flags=re.M); value=re.sub(r'^潛力:[^\n]*\n?','',value,flags=re.M); ids+=['professional-ability-scope']
 if index in (84,85,86,87): ids+=['prison-public-boundary']
 if index==88 and part==0: value=re.sub(r'灰色[^\n]*','',value); ids+=['eden-public-surface']
 if index==88 and part==2: value=value.split('### **【與曙光市勢力關聯】**')[0].rstrip(); ids+=['eden-public-surface']
 if index==89 and part==0: value=re.sub(r'效果：[^\n]*','效果：神經刺激、感覺調節與記憶干擾等高風險效果',value); value=re.sub(r'來源：[^\n]*','來源：黑市科技，來源未定',value); ids+=['eden-public-surface']
 if index==89 and part==3: ids+=['eden-public-surface']
 if index==89 and part==4: value=re.sub(r'\*\*可能的異能增幅\*\*[\s\S]*','',value).rstrip(); ids+=['eden-public-surface']
 return value,ids
