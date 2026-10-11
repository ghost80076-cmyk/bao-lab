"""Complete the Creator-exported card with current native author contracts."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
CARD = ROOT / 'data/characters/community/73/sunrise-city-disorder.json'
card = json.loads(CARD.read_text())
card['meta']['author'] = '班長'
card['meta']['author_id'] = 'banzhang'
card['meta']['title'] = card['meta']['name']
card['content']['author_instructions'] = card['content'].get('author_instructions','').replace('模式不取消玩家控制權，','')
if '【顯示標記】' not in card['content']['author_instructions']:
    card['content']['author_instructions'] += '\n\n【顯示標記】\n場景正文包在【YB:SUNRISE:SCENE】與【/YB:SUNRISE:SCENE】之間；回憶片段改用 MEMORY 同位置標記。必要的2–4項行動建議另包在【YB:SUNRISE:ACTIONS】與【/YB:SUNRISE:ACTIONS】之間，不寫HTML或完整狀態表。' 
if '【入學一致性】' not in card['content']['system_prompt']:
    card['content']['system_prompt'] += '\n\n【入學一致性】\n成年學生的預設起點是普通大學。天璇正式入學需C級以上異能；無異能者可作訪客、研究助理或旁聽者，不能擅自給異能或認定通過入學門檻。玩家明確設定正式天璇學生但無異能時，只確認這個矛盾，不重啟創建。'
card['content']['system_prompt'] = card['content']['system_prompt'].replace('玩家 Persona、', '玩家資料、').replace('不替玩家填罪行。', '罪行內容以玩家已確認的設定為準。')

def field(key, label, module, kind='text', default='', options=None, **extra):
    value = {'key':key,'label':label,'type':kind,'target_path':f'modules.{module}.{key}','default':default,**extra}
    if options:
        value['options'] = options
        if '自訂' in options:
            value['custom_option'] = '自訂'
            value.setdefault('placeholder', '請輸入自訂' + label)
    return value

routes = ['罪犯路線','抓捕者路線','黑幫／中立路線','成年學生路線','自創勢力路線']
starts = [
 ('第一監獄C區','罪犯路線','曙光市第一監獄｜C區重刑犯牢房','鐵門外傳來鑰匙碰撞的聲音。獄警把一張尚未簽名的交接單夾在門邊；餐廳廣播響起後，鄰床的人仍沒有起身。桌角留著一張寫有時間的紙條，落款不明。','先確認交接單、紙條與周圍可見的規矩。','監獄', '現在'),
 ('廢棄9號碼頭','罪犯路線','港口工業區｜廢棄9號碼頭','雨滴穿過破損的鐵皮屋頂。停在岸邊的貨車沒有開燈，駕駛座的手機卻亮起；堤岸另一端有人喊了兩次貨櫃編號，接著一束手電光沿倉庫牆面移動。','判斷貨車、喊話與手電光的來源。','港口工業區','現在'),
 ('案發前24小時','罪犯路線','曙光市｜案發前24小時的街口','咖啡店的時鐘慢了一分鐘。窗外，一輛沒有卸貨的廂型車停了很久；收據背面出現一個與已知往事有關的地址。這段回溯只確立可見的環境，尚未指向任何人的罪行。','確認地址與玩家已知的往事；未定部分保持未定。','曙光市','回憶'),
 ('嫌犯審訊室','罪犯路線','曙光市警局｜嫌犯審訊室','錄音設備的紅燈亮著。桌對面的調查員把一只證物袋推到中線，裡面的車票印著昨晚的時間。他的問題尚未出口，門外先響起短促的敲門聲。','辨認車票與調查員實際提出的問題。','中央商業區','現在'),
 ('特異對策課辦公室','抓捕者路線','曙光市警局｜特異對策課辦公室','影印機吐出一張被退回的協查單。值班電話亮著第二通來電，螢幕上是港口一只空貨櫃的現場照片；封條日期與報案紀錄相差一天。隔壁桌的同事正在向接線員核對編號。','查證封條日期與報案時間的差異。','中央商業區','現在'),
 ('第五起案發現場','抓捕者路線','東區平民區｜第五起案件封鎖線外','封鎖帶在風裡拉直。現場人員正把標記牌放在地面，一旁的居民堅持昨晚先聽見的是煞車聲；照片上的門鎖與筆錄描述卻不一致。完整死因與系列案關聯仍未確定。','比對門鎖照片、筆錄與居民說法。','東區平民區','現在'),
 ('調查員審訊室','抓捕者路線','曙光市警局｜調查員審訊室','嫌疑人把水杯移到桌邊，杯底留下一圈濕痕。錄音員指了指尚未填寫的時間欄；證物袋內的票根只證明一趟行程，還不能證明是誰使用。','確認票根來源與已知的不在場說法。','中央商業區','現在'),
 ('追捕中的港口碼頭','抓捕者路線','港口工業區｜碼頭通道','貨櫃吊臂發出一聲低響。無線電剛報出一個車牌，閘口卻同時開了兩條通道；穿反光背心的工人往左看了一眼，沒有回答保全的喊話。','核對車牌、通道與工人的可見動作。','港口工業區','現在'),
 ('Rose Club VIP包間','黑幫／中立路線','紅燈區｜Rose Club VIP包間','厚地毯吞掉門外的腳步。包間桌上的帳單被折成兩半，一名成年接待員正在確認預約；杯墊背面寫著一個貨物編號，與螢幕上的新聞滾動字幕相同。','查證預約、帳單與貨物編號的關聯。','紅燈区','現在'),
 ('南區廢棄工廠','黑幫／中立路線','南區｜廢棄工廠','廠房裡只有一排燈能亮。兩名搬運工在爭論少了一只木箱，牆邊的清單有一處被墨水蓋掉；鐵鏈組織的標誌只出現在包裝上，不能直接證明貨物屬於誰。','比對缺箱紀錄與現場可見貨物。','南區貧民窟','現在'),
 ('東區地下實驗室','黑幫／中立路線','東區平民區｜地下實驗室','通風扇轉得忽快忽慢。研究員把標本櫃鎖上，桌面的檢測單有兩個互不相同的編號；一個標籤寫著「未確認」，旁邊的電話正在震動。','核對兩個編號及未確認的檢測結果。','東區平民區','現在'),
 ('紅燈區夜店','黑幫／中立路線','紅燈區｜夜店入口','音樂從第二道門後傳出。保全正在比對預約名單，一名成年客人把手機遞給櫃檯，說帳單裡多了一筆自己沒有確認的交易；螢幕上的商戶名稱被截掉一半。','觀察交易爭議與現場人物的資訊來源。','紅燈區','現在'),
 ('天璇學院大學部','成年學生路線','天璇異能學院｜大學部訓練場','訓練場的防護燈由綠轉黃。教員停下計時器，要求工作人員檢查一處異常讀值；另一組成年學員的器材箱還沒拆封，封條卻已經有一道裂口。','確認器材封條與防護讀值的異常。','北山住宅區','現在'),
 ('普通大學','成年學生路線','曙光市普通大學｜校內走廊','走廊的雨傘桶已經滿了。佈告欄上貼出一場異能登記講座，旁邊有人留下反對登記的傳單；兩名成年學生正爭論一封通知的真偽。','查證通知來源並觀察校內立場分歧。','東區平民區','現在'),
 ('學院圖書館','成年學生路線','天璇異能學院｜大學部圖書館','借還書機響了兩次。成年研究助理把一份缺頁的期刊交給館員，書籤上留著館藏編號；查詢螢幕显示該卷昨晚被借過，但借閱者姓名未公開。','查證缺頁期刊與館藏紀錄。','北山住宅區','現在'),
 ('學生宿舍','成年學生路線','天璇異能學院｜成人宿舍','桌上的燈罩晃了一下。走廊有人把一封通知塞進公共信箱，值班管理員還在核對晚歸名單；公告寫著明日的訓練安排，底下卻多了一行手寫更正。','確認訓練通知與手寫更正的來源。','北山住宅區','現在'),
 ('東區秘密據點','自創勢力路線','東區平民區｜組織據點','捲門只升到一半。桌上攤著一份尚未簽署的租約，另一端壓著兩張不同報價的物資清單；聯絡人留言說，今晚能見面，但不願在電話裡說目的。','確認據點成本、可用物資與見面條件。','東區平民區','現在'),
 ('剛成立組織的廢棄建築','自創勢力路線','東區平民區｜廢棄建築','雨水從牆縫滲進來。臨時桌上的點名簿還是空的，工具箱旁壓著一張拆除通知；門外的人只自稱介紹人，沒有展示任何組織證件。','查證拆除通知與介紹人的身分。','東區平民區','現在'),
 ('研究型地下實驗室','自創勢力路線','曙光市｜研究型地下實驗室','冷卻器持續嗡鳴。一份合作邀約放在空白研究日誌旁，對方要求的交付時間很短；校準儀上的讀數仍在漂移，沒有任何結果能直接下結論。','評估校準、資源與合作邀約。','曙光市','現在'),
 ('逃亡者安全屋','自創勢力路線','東區平民區｜安全屋','玄關的鎖多了一道新刮痕。公共桌上有一封求助訊息，發信者只交代了今晚的碰面地點；收音機播報的追查通告並沒有公開姓名。','核對求助訊息與追查通告，保留是否回覆的選擇。','東區平民區','現在')
]
fields = [
 field('route','路線','player','select','抓捕者路線',routes),
 field('start','起點','player','select','依路線起點',['依路線起點']+[s[0] for s in starts]+['自訂']),
 field('identity','身份','player','select','依路線身份',['依路線身份','連續殺人犯','詐欺犯','黑幫成員','逃脫實驗體','特異對策課幹員','刑警','煉律審查官','臥底警察','獨立異能者','成年大學部學生','天璇大學部學生','臥底成年學生','異能研究者','天才異能者','組織領導者','反登記法組織成員','研究組織成員','自訂']),
 field('age','年齡','player','number',24,min=18,max=100),
 field('ability','異能類型','player','select','無異能',['無異能','心靈系','元素系','身體系','空間系','生物系','變異系','特殊系','禁忌系','自訂']),
 field('ability_rank','異能等級','player','select','未設定',['未設定','D','C','B','A','S','SS','SSS']),
 field('registration','登記狀態','player','select','未設定',['未設定','已登記','未登記','假登記']),
 field('ability_detail','異能效果／限制','player',placeholder='效果、範圍、使用代價與弱點'),
 field('difficulty','難度','player','select','正常',['正常','困難','混亂']),
 field('relationship_mode','關係方向','player','select','正常',['正常','純愛','NTR','NTL','GL']),
 field('social_order','權力結構','player','select','正常',['正常','女尊','男尊']),
 field('mature_theme','成熟題材','player','select','正常',['正常','性開放社會','禁忌關係張力','暴力','自訂']),
 field('npc_ratio','新NPC男女比例','player',default='50男50女',placeholder='只影響新人物偏好，不改既有人物'),
 field('background','性格／背景補充','player',placeholder='可填職業、性格、外貌、動機、已確認往事'),
 field('bag_size','背包容量','player','select','中型10格',['小型5格','中型10格','大型15格'])]

def module(mid,label,kind='object',context='relevant', fields=None):
    item = {'id':mid,'label':label,'kind':kind,'tracking':'high' if context=='core' else 'medium','context':context}
    if fields: item['fields']=[{'key':k,'label':l,'type':t,**({'min':-1,'max':100} if t=='meter' else {})} for k,l,t in fields]
    return item

modules = [module('player','玩家與模式',context='core'),
 module('status','身體與資源狀態',context='core',fields=[('energy','體力','meter'),('mental','精神','meter'),('condition','當前狀態','text')]),
 module('scene','場景限制',context='core'),module('timeline','雙時間線',context='core'),
 module('case','案件檔案'),module('quests','當前目標','collection'),module('economy','經濟'),
 module('inventory','背包','collection'),module('skills','技能','collection'),module('factions','勢力關係','collection'),
 module('custody','監獄狀態'),module('intel','已得知資訊','collection')]
initial = {'time':'血色七月15年後｜第一夜 21:00','location':'曙光市','events':[], 'npcs':[],
 'world_clock':{'version':1,'tick_minutes':0,'next_event_seq':1,'scheduled_events':[]},
 'modules':{'player':{},'status':{'energy':-1,'mental':-1,'condition':'未確認'},'scene':{},
 'timeline':{'current':'現在','reference':'故事開場基準：血色七月15年後','past_time':'','present_time':'第一夜 21:00'},
 'case':{'phase':'尚未立案','evidence':[],'questions':[],'progress':0},'quests':[],
 'economy':{'cash':None,'bank':None,'grey_currency':None,'debt':'未確認'},'inventory':[],'skills':[],'factions':[],
 'custody':{'district':'','cell':'','sentence':'未確認'},'intel':[]}}
for f in fields: initial['modules']['player'][f['key']] = f['default']
initial['modules']['player']['name']=''
identities = dict(zip(routes,['被關押者（罪行以玩家已確認設定為準）','特異對策課幹員','獨立異能者','成年大學部學生','組織領導者']))
cases = []
for label,route,location,scene,goal,district,timeline in starts:
    scene = scene.replace('显示','顯示'); district = district.replace('红','紅').replace('区','區')
    heading = '⏪ 回憶｜案發前24小時' if timeline=='回憶' else '曙光市｜第一夜'
    body = f'【YB:SUNRISE:SCENE】\n{heading}｜{location}\n\n{scene}\n【/YB:SUNRISE:SCENE】'
    patches = [{'path':'modules.scene.district','value':district}, {'path':'modules.scene.current_focus','value':goal},
               {'path':'modules.timeline.current','value':timeline},
               {'path':'modules.quests','value':[{'id':'opening-hook','title':'起始目標','description':goal,'status':'available','source':'開場可見線索'}]}]
    if timeline=='回憶': patches += [{'path':'modules.timeline.past_time','value':'案發前24小時'},{'path':'modules.timeline.past_location','value':location}] 
    if label=='第一監獄C區': patches += [{'path':'modules.custody.district','value':'C區'}]
    cases.append({'value':label,'time':'血色七月15年後｜第一夜 21:00' if timeline=='現在' else '血色七月15年後｜第一夜 21:00',
                  'location':location,'greeting':body,'choices':['我先觀察現場的人與物。','我查證眼前資訊的來源。','我先確認自己的資源與限制。'], 'patches':patches})
for route,first in zip(routes,[0,4,8,13,16]):
    item=json.loads(json.dumps(cases[first])); item['value']=route; cases.append(item)
startup={'version':1,'selector_path':'modules.player.start','default_selector_path':'modules.player.route','default_when':'依路線起點',
 'defaults':[{'path':'modules.player.identity','when':'依路線身份','by_path':'modules.player.route','values':identities},
             {'path':'modules.player.ability_rank','when':'未設定','by_path':'modules.player.ability','values':{'無異能':'無'}},
             {'path':'modules.player.registration','when':'未設定','by_path':'modules.player.ability','values':{'無異能':'不適用'}}],
 'cases':cases,
 'fallback_location':'{{modules.player.start}}',
 'fallback_greeting':'【YB:SUNRISE:SCENE】\n曙光市｜{{modules.player.start}}\n\n雨聲被近處的建築遮去一半，遠方仍有車流與夜間廣播。附近的公共螢幕忽然中斷節目，跳出一則協查通告。畫面只停了幾秒，又被另一則訊息蓋過；遠處有人正向值班員詢問通告中的時間。聲音、記錄與你已知的背景之間，是否有可以查證的連結？\n【/YB:SUNRISE:SCENE】',
 'fallback_choices':['我先觀察這個地方。','我確認自己的資源與目標。']}

def stat(label,path): return {'label':label,'path':path}
def section(kind,title,**values):return {'type':kind,'title':title,**values}
panels = [
 {'id':'now','label':'此刻','sections':[section('stats','時間與位置',items=[stat('時間','time'),stat('地點','location'),stat('時間線','modules.timeline.current'),stat('眼前目標','modules.scene.current_focus')]),
   section('meters','當前狀態',items=[{'label':'體力','path':'modules.status.energy','max':100},{'label':'精神','path':'modules.status.mental','max':100}]),
   section('stats','身體狀態',items=[stat('狀態','modules.status.condition')])]},
 {'id':'player','label':'人物','sections':[section('stats','玩家設定',items=[stat(f['label'],f['target_path']) for f in fields]),section('cards','已知人物',path='npcs',variant='codex',empty='尚無已確認人物。',limit=16)]},
 {'id':'case','label':'案件','sections':[section('stats','案件階段',items=[stat('階段','modules.case.phase'),stat('準備度','modules.case.progress')]),section('cards','已收集證據',path='modules.case.evidence',variant='codex',empty='尚無已確認證據。'),section('list','待釐清疑點',path='modules.case.questions',empty='尚無疑點紀錄。'),section('list','已得知資訊',path='modules.intel',empty='尚無已確認情報。')]},
 {'id':'quests','label':'目標','sections':[section('cards','主線／支線',path='modules.quests',variant='quest',empty='尚無任務。'),section('stats','監獄狀態',items=[stat('監區','modules.custody.district'),stat('牢房','modules.custody.cell'),stat('刑期','modules.custody.sentence')])]},
 {'id':'resources','label':'資源','sections':[section('stats','資產',items=[stat('現金','modules.economy.cash'),stat('存款','modules.economy.bank'),stat('灰色貨幣','modules.economy.grey_currency'),stat('負債','modules.economy.debt')]),section('cards','背包',path='modules.inventory',variant='codex',empty='物品尚未確認。'),section('cards','技能',path='modules.skills',variant='skill',empty='技能尚未確認。')]},
 {'id':'factions','label':'勢力','sections':[section('cards','已知關係',path='modules.factions',variant='codex',empty='關係尚未確認。')]},
 {'id':'history','label':'紀錄','sections':[section('stats','時間線紀錄',items=[stat('現在基準','modules.timeline.present_time'),stat('回憶時間','modules.timeline.past_time'),stat('回憶位置','modules.timeline.past_location')]),section('timeline','最近事件',path='events',mode='history',empty='尚無已確認事件。',limit=3)]},
 {'id':'actions','label':'行動','sections':[section('actions','下一步',items=[{'label':'觀察現場','draft':'我先觀察現場的人、物品與出口。'},{'label':'查證情報','draft':'我查證眼前資訊的來源，分辨事實、說法與推測。'},{'label':'盤點資源','draft':'我確認目前可用的資源、身體狀態與能力限制。'},{'label':'回憶片段','draft':'【回憶】我想回溯這個已確認的事件：'}])]}]
ui={'version':1,'title':'曙光市案件檔案','initial_panel':'now',
 'builder':{'title':'你的曙光市角色','description':'一次設定路線與起點；開始後直接承接現場。自訂選項可在此輸入，空白補充不會替你捏造過去。','point_pool':0,'attributes':[],'fields':fields},
 'panels':panels,'theme':{'preset':'noir','density':'comfortable','radius':'soft','meter':'soft','accent':'#b79061','surface':'#201b1a','surface_alt':'#302625','text':'#e8ded2','muted':'#baa997','border':'#655348'},
 'layout':{'preset':'rpg-dashboard','left_panel':'player','right_panel':'now'}}
status_fields = [
 ('visible_condition','身體／衣著','text',''),('observed_emotion','情緒表現','text',''),
 ('relationship_axes','信任／敬意／恐懼／敵對','text',''),('known_information','已知資訊與來源','text',''),
 ('current_action','正在做什麼','text',''),('last_confirmed','最後確認位置／時間','text',''),
 ('psychological_observation','心理標籤／觀察','text',''),('sexual_desire','性慾狀態（未知不推定）','text','未知'),
 ('openness','親密開放度','text','未知'),('criminal_drive','犯罪欲望','text','未知'),('violent_drive','暴力衝動','text','未知')]
card['gameplay'].update({'world_modules':modules,'initial_state':initial,'ui_schema':ui,'story_startup':startup,'timeline_policy':{'version':1,'module':'timeline','past_value':'回憶','present_value':'現在'},
 'character_status':{'enabled':True,'allow_player_customize':True,'fields':[{'key':k,'label':l,'type':t,'default':d,'context':'relevant','track':True,**({'min':-1,'max':100} if t=='meter' else {})} for k,l,t,d in status_fields]},
 'prompt':{'include_lore':True,'include_world':True,'include_world_focus':True,'include_npcs':True,'include_author_instructions':True,'include_creator_notes':False,'include_dynamic_prompts':True}})
card['content']['dynamic_prompts']=[{'id':k,'label':label,'triggers':triggers,'text':body,'recent_turns':2} for k,label,triggers,body in [
 ('investigation','證據與調查',['調查','證據','現場','筆錄','監控'],'區分現場痕跡、證人說法與推論；來源、取得時間、矛盾及可能污染需有依據。案件準備度不是自動定罪率。給可操作的下一個查證點，不直接揭露幕后真相。'),
 ('interrogation','審訊',['審訊','招供','審問','自白'],'問題、出示證據、回應與壓力逐步推進；沉默、拒答、否認與交易都有可能。異能需符合登記、範圍與代價，不能直接把猜測變成供詞。'),
 ('prison','監獄生態',['監獄','牢房','越獄','獄警'],'依監區、作息、資源與已知派系運作。逃離需依情報、準備、嘗試與當場結果推進，不省略成逃脫成功。未得知的獄警秘密與地下勢力不可直接顯示。'),
 ('memory-frame','回憶與現在',['回憶','回到現在','案發前'],'回憶只用已確認往事或明確標示的角色陳述／重演。現在狀態保留，回憶不更新現在物品、傷勢與時鐘；資訊返抵現在需有合理來源。不預設玩家在回憶中犯過罪。'),
 ('ability','異能代價',['異能','讀心','覺醒','反噬'],'先確認能力類型、等級、範圍、代價與已知限制。沒有異能者不能因一次選項自動覺醒；未使用的讀心不能讓NPC取得隱私。'),
 ('factions','勢力與關係',['三合會','狼幫','鐵鏈','結盟','背叛'],'勢力有利益與資訊限制；關係變化承接實際互動，不以好感值決定絕對服從。新盟約須當事人明確答應，尚在提議不記為已完成。'),
 ('elapsed','時間與離場',['睡眠','休息','等待','離開','重逢'],'按已確認經過的故事時間推進離場人物的合理活動。短句不是固定5分鐘；不因玩家關閉網頁自動過夜。再次見面用可見行動、痕跡或訊息呈現。')]]
library=json.loads((ROOT/'data/sunrise-worldbook-library.json').read_text())
book=[]
for pack in library['packs']:
    keywords=list(dict.fromkeys(k for e in pack['entries'] for k in e['keywords']))[:16]
    body='\n\n'.join(e['content'] for e in pack['entries'])
    if pack['meta']['id']=='sunrise-city-overview': body=body.replace('人口 800 萬','人口 500 萬')
    # The mother draft defines this card's security grades. District figures in
    # older snippets do not form a coherent 5-million census; omit these
    # unsupported totals here while preserving the shared source unchanged.
    import re
    body=re.sub(r'\*\*常住人口：[0-9]+ 萬\*\*', '**常住人口：統計尚待確認**', body)
    body=re.sub(r'\*\*人口\*\*：約 [0-9]+ 萬人[^\n]*', '**人口**：片區統計尚待確認', body)
    if pack['meta']['id']=='sunrise-north-geography': body=body.replace('治安等級**：A 級','治安等級**：S 級')
    if pack['meta']['id']=='sunrise-south-geography': body=body.replace('治安等級**：D 級','治安等級**：F 級')
    if pack['meta']['classification']=='scenario': body='可能劇情方向，尚未發生；僅在當前情境合理且玩家有選擇空間時參考。\n'+body
    book.append(f"【世界書：{pack['meta']['name'][:60].replace('｜','・').replace('|','・')}｜{'、'.join(keywords)}】\n{body}\n【/世界書】")
card['content']['lore']='\n\n'.join(book)
card['presentation']['play_info_surface']='game-ui'
card['presentation']['reading_background']=card['meta']['avatar']
card['presentation']['ui']={'type':'basic','panels':['status','npc','events','memory']}
regex={'version':1,'type':'yorubay-author-regex-mod','scope':'assistant_display','characterId':card['meta']['id'],'regex_scripts':[]}
for name,marker,title,colour in [('場景','SCENE','曙光市｜現場紀錄','#b79061'),('回憶','MEMORY','回憶片段｜陳述與已確認往事','#978aa5'),('行動','ACTIONS','可用行動｜自由輸入有效','#8f9c8e')]:
    regex['regex_scripts'].append({'scriptName':'曙光市｜'+name,'description':'只整理顯示，狀態與記憶沿用原生資料；不自動送出。','priority':60,
     'findRegex':f'【YB:SUNRISE:{marker}】\\s*([\\s\\S]*?)\\s*【/YB:SUNRISE:{marker}】','flags':'g',
     'replaceString':f'<section style="white-space:pre-wrap;line-height:1.85;background:#231d1c;color:#e8ded2;border:1px solid #655348;border-left:4px solid {colour};border-radius:14px;padding:16px;overflow-wrap:anywhere"><strong style="display:block;color:{colour};margin-bottom:10px">{title}</strong>$1</section>'})
card['import_metadata']={'source_format':'yorubay-creator-native-upgrade','source_origin':'author-provided Sunrise mother draft + reviewed public lore',
 'regex_file':'data/characters/community/73/sunrise-city-disorder.regex.json','preserved_source':regex,
 'notes':'Creator 匯出後補原生創建、啟動場景、狀態與UI。保留創作核心；非露骨成熟關係；其他LLM未實測。',
 'worldbook_variant':{'population':5000000,'shared_source_population':8000000,'decision':'作品採作者此次提供的500萬；共享原始來源保留不改。'}}
CARD.write_text(json.dumps(card,ensure_ascii=False,indent=2)+'\n')
CARD.with_name('sunrise-city-disorder.regex.json').write_text(json.dumps(regex,ensure_ascii=False,indent=2)+'\n')
print('Built native Sunrise card:',len(fields),'fields,',len(modules),'modules,',len(cases),'start cases,',len(book),'lore groups')
