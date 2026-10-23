/* YoruBay interface localization. Completely separate from AI story reply preferences.
 * Only translate known product UI strings; never translate authored stories or player input.
 */
(() => {
  "use strict";
  if (window.BAOSiteI18n) return;

  const KEY = "yorubay:interface-language";
  const SUPPORTED = ["zh-Hant", "zh-Hans", "en"];
  const DEFAULT = "zh-Hant";
  // Keys are the authored Traditional Chinese UI copy. Values are [Simplified, English].
  // Missing copy deliberately stays as authored instead of machine-translating player data.
  const dictionary = Object.freeze({
    "單輪觀賞模式": ["单轮观赏模式","One-turn spectator mode"],
    "關閉（預設）": ["关闭（默认）","Off (default)"],
    "開放 · 指令才暫時代演": ["开放 · 仅指令触发临时代演","Allow temporary portrayal by command"],
    "開放後，單獨送出「繼續」「然後呢」或「【觀賞一輪】」，本輪可讓 AI 依人設代演日常言行。下輪由你說話或行動就恢復原本模式；重大決策仍由你決定。「繼續描寫」快捷指令不會啟動觀賞。": ["开启后，单独发送“继续”“然后呢”或“【观赏一轮】”，AI 可在本轮按人设代演日常言行。下轮你自行说话或行动就恢复原模式；重大决定仍由你掌握。“继续描写”快捷指令不会启动观赏。","When enabled, send only “繼續”, “然後呢”, or “【觀賞一輪】” to let AI portray everyday actions for this turn. Your next dialogue or action restores the original mode. Major decisions remain yours. The Continue Writing shortcut does not trigger spectator mode."],
    "故事方向": ["故事方向","Story direction"],
    "守住當下，也可以留一點期待": ["守住当下，也可以留一点期待","Stay in the moment, with room for hope"],
    "場景投入保護": ["场景投入保护","Scene immersion protection"],
    "依作品安排（預設）": ["依作品安排（默认）","Follow the story (default)"],
    "場景專注 · 不無故打斷": ["场景专注 · 不无故打断","Protect focused scenes"],
    "只在角色正投入連續互動時，減少為了製造高潮而硬插入的事件。世界時間、已成立的期限與 NPC 自主照常運作。": ["仅在角色正投入连续互动时，减少为了制造高潮而硬插入的事件。世界时间、既定期限与 NPC 自主照常运作。","Avoid forced interruptions during ongoing character scenes. World time, established deadlines, and NPC autonomy continue."],
    "玩家的劇情期待": ["玩家的剧情期待","Player story expectations"],
    "（選填 · 最多 240 字）": ["（选填 · 最多 240 字）","(optional · up to 240 characters)"],
    "這是玩家在戲外希望探索的方向，不是角色的想法、NPC 已知事實，也不保證達成。": ["这是玩家在戏外希望探索的方向，不是角色的想法、NPC 已知事实，也不保证达成。","An out-of-character direction, not the player's character thoughts, NPC knowledge, or a guaranteed outcome."],
    "玩家角色演繹": ["玩家角色演绎", "Player portrayal"],
    "玩家主控 · 沿用原有程度": ["玩家主控 · 沿用原有程度", "Player control · original scope"],
    "敘事補述 · 將你的演出融入正文": ["叙事补述 · 将你的演出融入正文", "Narrative detail · weave in your input"],
    "小說共創 · 依人設補寫日常言行": ["小说共创 · 依人设补写日常言行", "Coauthor · add everyday dialogue and actions"],
    "補述不新增台詞或心理；共創可補寫日常反應。重要決策仍由你決定，可隨時切回主控。": ["补述不新增台词或心理；共创可补写日常反应。重要决策仍由你决定，可随时切回主控。", "Narrative detail adds no new dialogue or thoughts. Coauthoring can add everyday reactions. Important decisions remain yours; switch back anytime."],
    "此項只控制 NPC 的內在描寫；玩家角色依上方演繹授權與自訂限制處理。": ["此项只控制 NPC 的内在描写；玩家角色依上方演绎授权与自定义限制处理。", "Controls NPC inner thoughts only. Player portrayal follows your authorization and custom limits above."],
    "玩家主控": ["玩家主控", "Player control"],
    "敘事補述": ["叙事补述", "Narrative detail"],
    "小說共創": ["小说共创", "Coauthoring"],
    "首頁": ["首页", "Home"],
    "作品": ["作品", "Stories"],
    "故事": ["故事", "Stories"],
    "主要導覽": ["主要导航", "Main navigation"],
    "作者": ["作者", "Creators"],
    "我的": ["我的", "My space"],
    "我的故事": ["我的故事", "My stories"],
    "關於夜灣": ["关于夜湾", "About YoruBay"],
    "繼續上次故事": ["继续上次故事", "Resume story"],
    "繼續閱讀": ["继续阅读", "Continue reading"],
    "開始探索": ["开始探索", "Explore stories"],
    "探索作品": ["探索作品", "Explore stories"],
    "查看全部作品 →": ["查看全部作品 →", "See all stories →"],
    "第一次來？三步開始 ↗": ["第一次来？三步开始 ↗", "New here? Three steps ↗"],
    "跳至主要內容": ["跳至主要内容", "Skip to main content"],
    "今晚，想走進": ["今晚，想走进", "Whose story will you"],
    "誰的故事？": ["谁的故事？", "enter tonight?"],
    "替你留了一盞燈。": ["为你留了一盏灯。", "A light is waiting for you."],
    "每一個作品，都是一段正在等你打開的故事。選一個故事，從第一句話開始。": ["每一个作品，都是一段等待你开启的故事。选一个故事，从第一句话开始。", "Every work holds a story waiting to begin. Pick one and start with your first line."],
    "故事在這裡靠岸": ["故事在这里靠岸", "Stories find a harbor here"],
    "每一個世界，都有一個等你靠岸的位置。": ["每一个世界，都有一个等你靠岸的位置。", "Every world has a place for you to arrive."],
    "今晚推薦": ["今晚推荐", "Tonight's pick"],
    "本機故事": ["本机故事", "Local story"],
    "上次閱讀": ["上次阅读", "Last read"],
    "繼續你的故事": ["继续你的故事", "Continue your story"],
    "你的故事": ["你的故事", "Your story"],
    "上一次停下來的地方，還替你留著。": ["上次停下的地方，还为你保留着。", "Pick up where you left off."],
    "打開我的故事": ["打开我的故事", "Open my stories"],
    "更多作品，今晚也在等你。": ["更多作品，今晚也在等你。", "More stories await tonight."],
    "今夜有": ["今夜有", "Tonight,"],
    "個故事正在等你。": ["个故事正在等你。", "stories await you."],
    "今晚的故事": ["今晚的故事", "Tonight's story"],
    "每個世界，都有自己的夜色。": ["每个世界，都有自己的夜色。", "Every world has its own night."],
    "有人喜歡平靜，有人期待相遇，也有人追逐風暴。": ["有人喜欢平静，有人期待相遇，也有人追逐风暴。", "Some seek quiet, some seek connection, and others chase storms."],
    "選擇故事的氛圍、節奏與互動，走進屬於你的夜晚。": ["选择故事氛围、节奏与互动，走进属于你的夜晚。", "Choose the mood, pace and interactions of your story."],
    "夜色": ["夜色", "Mood"],
    "故事氛圍": ["故事氛围", "Story atmosphere"],
    "電影光影、日常暖意，或細膩心事。": ["电影光影、日常暖意，或细腻心事。", "Cinematic shadows, everyday warmth, or quiet emotion."],
    "潮汐": ["潮汐", "Tides"],
    "故事節奏": ["故事节奏", "Story pacing"],
    "慢慢醞釀、自然流動，或波瀾不斷。": ["慢慢酝酿、自然流动，或波澜不断。", "Slow build, natural flow, or constant change."],
    "同行者": ["同行者", "Companions"],
    "角色互動": ["角色互动", "Character interaction"],
    "慢熱回應，或更常主動開啟話題。": ["慢热回应，或更常主动开启话题。", "Reserved responses or more active conversations."],
    "開始故事前或閱讀時，都能在「今晚的故事」調整。預設保留作品原貌。": ["开始故事前或阅读时，都能在“今晚的故事”调整。默认保留作品原貌。", "Adjust this before or during a story. Original story settings are preserved by default."],
    "翻開一頁": ["翻开一页", "Turn a page"],
    "留一點安靜，": ["留一点安静，", "Leave some quiet,"],
    "讓故事慢慢發生。": ["让故事慢慢发生。", "and let the story unfold."],
    "讀完這一段，再決定下一句。你可以回看前情、整理重要記憶，讓每一次選擇都有跡可循。": ["读完这一段，再决定下一句。你可以回看前情、整理重要记忆，让每次选择都有迹可循。", "Read at your own pace, revisit earlier scenes and keep the memories that matter."],
    "從一句話開始，也可以寫成很長的故事。": ["从一句话开始，也可以写成很长的故事。", "One line can grow into a long story."],
    "閱讀示例": ["阅读示例", "Reading sample"],
    "第一章": ["第一章", "Chapter one"],
    "第二章": ["第二章", "Chapter two"],
    "故事停在這裡，等你接下一句。": ["故事停在这里，等你接下一句。", "The next line is yours to write."],
    "故事書庫": ["故事书库", "Story library"],
    "章節示例": ["章节示例", "Chapter preview"],
    "留在書庫的故事": ["留在书库的故事", "Saved in your library"],
    "每次回來，都有一頁等著你。": ["每次回来，都有一页等着你。", "A page awaits whenever you return."],
    "第一次相遇": ["第一次相遇", "First meeting"],
    "還沒說完的話": ["还没说完的话", "Words left unsaid"],
    "打開我的故事書庫": ["打开我的故事书库", "Open story library"],
    "留住故事": ["留住故事", "Keep your stories"],
    "今晚先讀到這裡。": ["今晚先读到这里。", "That's all for tonight."],
    "下次，接著寫。": ["下次，接着写。", "Continue next time."],
    "把故事與章節留在自己的書庫。回來時繼續，也能保留分支，走向另一種可能。": ["把故事与章节留在自己的书库。回来时继续，也能保留分支，走向另一种可能。", "Keep chapters in your library and return later, or branch into a different possibility."],
    "換個裝置，接上同一個故事。": ["换个设备，接上同一个故事。", "Same story, another device."],
    "故事先保存在目前裝置。想在手機與電腦之間接續，可連結自己的 Google 雲端硬碟；換裝置後先同步，再從書庫繼續。": ["故事先保存在当前设备。想在手机与电脑间接续，可连接自己的 Google 云端硬盘；换设备后先同步，再从书库继续。", "Stories are stored on this device first. To continue on another device, connect your own Google Drive and sync your library."],
    "查看跨裝置同步": ["查看跨设备同步", "Cross-device sync"],
    "連線金鑰（API Key）不會同步，換裝置時需重新輸入。": ["连接密钥（API Key）不会同步，换设备时需重新输入。", "API keys are never synced; enter yours again on another device."],
    "替你留著燈": ["为你留着灯", "The light stays on"],
    "下一頁，從你開始。": ["下一页，从你开始。", "The next page starts with you."],
    "選一個作品，把第一句話留給今晚。": ["选一个作品，把第一句话留给今晚。", "Choose a story and write its first line tonight."],
    "建立故事": ["建立故事", "Set up your story"],
    "← 返回角色": ["← 返回角色", "← Back to character"],
    "1 敘事": ["1 叙事", "1 Narrative"],
    "2 顯示": ["2 显示", "2 Display"],
    "3 玩家": ["3 玩家", "3 Player"],
    "4 模型連線": ["4 模型连接", "4 Model"],
    "5 記憶": ["5 记忆", "5 Memory"],
    "敘事模式": ["叙事模式", "Narrative mode"],
    "單角色沉浸": ["单角色沉浸", "Character immersion"],
    "聚焦角色關係與場景互動。": ["聚焦角色关系与场景互动。", "Focus on characters and scenes."],
    "世界模擬": ["世界模拟", "World simulation"],
    "NPC 與事件會持續運作。": ["NPC 与事件会持续运作。", "NPCs and events develop within the story."],
    "顯示模式": ["显示模式", "Display mode"],
    "純文本": ["纯文本", "Plain text"],
    "乾淨的小說式聊天。": ["简洁的小说式聊天。", "A clean, novel-style conversation."],
    "互動 UI": ["互动 UI", "Interactive UI"],
    "顯示 NPC、狀態、事件與記憶。": ["显示 NPC、状态、事件与记忆。", "Show NPCs, status, events and memory."],
    "玩家資料（Persona）": ["玩家资料（Persona）", "Player persona"],
    "名稱": ["名称", "Name"],
    "性別": ["性别", "Gender"],
    "未指定": ["未指定", "Unspecified"],
    "男性": ["男性", "Male"],
    "女性": ["女性", "Female"],
    "其他": ["其他", "Other"],
    "身分": ["身份", "Identity"],
    "初始關係": ["初始关系", "Starting relationship"],
    "個性": ["个性", "Personality"],
    "其他設定": ["其他设置", "Other details"],
    "玩家名稱": ["玩家名称", "Player name"],
    "職業 / 身分": ["职业 / 身份", "Occupation / identity"],
    "陌生人 / 戀人 / 同事…": ["陌生人 / 恋人 / 同事…", "Strangers / partners / colleagues…"],
    "模型連線": ["模型连接", "Model connection"],
    "選模型服務、模型與連線金鑰即可；自訂服務才需要進階設定。": ["选择模型服务、模型和连接密钥即可；自定义服务才需要高级设置。", "Choose a provider, model and API key. Advanced settings are only needed for custom services."],
    "模型服務（Provider）": ["模型服务（Provider）", "Model provider"],
    "連線金鑰（API Key）": ["连接密钥（API Key）", "API key"],
    "貼上自己的連線金鑰": ["粘贴自己的连接密钥", "Paste your API key"],
    "只留在目前頁面記憶體，不會寫入故事存檔或備份。": ["仅保留在当前页面内存，不会写入故事存档或备份。", "Kept in this page's memory; never stored in story saves or backups."],
    "使用哪個模型？": ["使用哪个模型？", "Which model?"],
    "進階連線設定": ["高级连接设置", "Advanced connection settings"],
    "自訂 API、中轉或特殊服務才需要。": ["只有自定义 API、中转或特殊服务才需要。", "Only for custom APIs, relays or special services."],
    "模型代號（Model ID）": ["模型代号（Model ID）", "Model ID"],
    "連線網址（Base URL）": ["连接网址（Base URL）", "Base URL"],
    "例如：gemini-2.5-flash": ["例如：gemini-2.5-flash", "e.g. gemini-2.5-flash"],
    "故事記憶": ["故事记忆", "Story memory"],
    "記憶模式": ["记忆模式", "Memory mode"],
    "記憶模式：": ["记忆模式：", "Memory mode:"],
    "智慧整理": ["智能整理", "Smart summary"],
    "推薦 · 長篇故事": ["推荐 · 长篇故事", "Recommended · Long stories"],
    "記憶強度": ["记忆强度", "Memory strength"],
    "省錢": ["省钱", "Economy"],
    "精簡近期原文": ["精简近期原文", "Keep less recent text"],
    "平衡（推薦）": ["平衡（推荐）", "Balanced (recommended)"],
    "兼顧原文與記憶": ["兼顾原文与记忆", "Balance raw text and memory"],
    "長篇": ["长篇", "Long"],
    "保留更多近期細節": ["保留更多近期细节", "Keep more recent detail"],
    "自訂": ["自定义", "Custom"],
    "自行調整參數": ["自行调整参数", "Configure manually"],
    "進階設定": ["高级设置", "Advanced settings"],
    "上一步": ["上一步", "Previous"],
    "下一步": ["下一步", "Next"],
    "開始故事": ["开始故事", "Start story"],
    "快速儲存": ["快速保存", "Quick save"],
    "另存新檔": ["另存为新档", "Save as"],
    "管理存檔": ["管理存档", "Manage saves"],
    "匯入存檔": ["导入存档", "Import save"],
    "離開故事": ["离开故事", "Exit story"],
    "投餵肉包": ["投喂肉包", "Support Bao"],
    "人物": ["人物", "Characters"],
    "狀態": ["状态", "Status"],
    "事件": ["事件", "Events"],
    "記憶": ["记忆", "Memory"],
    "模式": ["模式", "Mode"],
    "顯示": ["显示", "Display"],
    "模型": ["模型", "Model"],
    "本輪輸入": ["本轮输入", "Turn input"],
    "快取命中": ["缓存命中", "Cache hits"],
    "新增輸入 — · 輸出 —": ["新增输入 — · 输出 —", "New input — · Output —"],
    "輸入你的行動或台詞…": ["输入你的行动或台词…", "Enter an action or dialogue…"],
    "送出": ["发送", "Send"],
    "我的人物": ["我的人物", "My characters"],
    "打開我的人物庫": ["打开我的人物库", "Open character library"],
    "繼續最近故事": ["继续最近故事", "Resume recent story"],
    "打開故事書庫": ["打开故事书库", "Open story library"],
    "內容顯示": ["内容显示", "Content visibility"],
    "外觀與操作": ["外观与操作", "Appearance & controls"],
    "調整外觀": ["调整外观", "Appearance settings"],
    "顯示成人內容": ["显示成人内容", "Show adult content"],
    "故事留在你的裝置；登入只用於你主動使用的線上服務。": ["故事保存在你的设备；登录仅用于你主动使用的在线服务。", "Stories stay on your device; sign-in is only for online services you choose."],
    "帳號與燈火": ["账号与灯火", "Account & Lights"],
    "帳號": ["账号", "Account"],
    "密碼": ["密码", "Password"],
    "登入": ["登录", "Sign in"],
    "建立帳號": ["建立账号", "Create account"],
    "恢復帳號": ["恢复账号", "Recover account"],
    "我的帳號": ["我的账号", "My account"],
    "登入夜灣帳號": ["登录夜湾账号", "Sign in to YoruBay"],
    "顯示名稱": ["显示名称", "Display name"],
    "登入帳號": ["登录账号", "Login username"],
    "第一次玩？三步開始 →": ["第一次玩？三步开始 →", "New here? Start in three steps →"],
    "模型連線完整說明 →": ["模型连接完整说明 →", "Model connection guide →"],
    "故事仍然留在你手上": ["故事仍然留在你手上", "Your stories stay yours"],
    "登入不是讀取私人故事的必要條件；自己的連線金鑰（API Key）也不會存進帳號。": ["登录不是读取私人故事的必要条件；自己的连接密钥（API Key）也不会存进账号。", "You do not need to sign in to read local stories. Personal API keys are not saved to your account."],
    "登入只在你主動使用夜灣燈火與線上服務時需要。自己的模型連線、本地故事、角色、記憶與世界狀態不需要登入。": ["只有主动使用夜湾灯火与在线服务时才需要登录。使用自己的模型连接、本地故事、角色、记忆与世界状态无需登录。", "Sign-in is needed only for optional online services such as YoruBay Lights. Your own API connection and local stories work without it."],
    "所有作者": ["所有作者", "All creators"],
    "正在整理作者頁…": ["正在整理作者页…", "Loading creator page…"],
    "完整連線說明 ↗": ["完整连接说明 ↗", "Connection guide ↗"],

    "NEW PLAYER · 三步驟": ["NEW PLAYER · 三步骤", "NEW PLAYER · THREE STEPS"],
    "不用懂程式，也能開始玩。": ["不用懂程序，也能开始玩。", "No coding needed to start."],
    "選一個想走進的作品，再決定故事要怎麼連線，就能開始。一般作品不需要先讀懂其他進階設定。": ["选一个想进入的作品，再决定故事要怎么连接，就能开始。普通作品不需要先学会高级设置。", "Choose a story and a model connection. Most stories need no advanced setup."],
    "選一個想走進的故事": ["选一个想进入的故事", "Choose your story"],
    "回首頁按「開始探索」，打開想玩的作品，再按「開始故事」。一般作品會直接進入「快速開始」；需要選開局方式的特殊世界，則會先顯示完整設定。": ["回首页点“开始探索”，打开想玩的作品，再点“开始故事”。普通作品进入“快速开始”；特殊世界会先显示完整设置。", "From Home, select Explore stories, open a work, then choose Start story. Most works use Quick start; advanced worlds can show the full setup."],
    "去探索作品 →": ["去探索作品 →", "Explore stories →"],
    "選一種模型連線方式": ["选一种模型连接方式", "Choose a model connection"],
    "進入快速開始後，先選「使用夜灣燈火」或「使用自己的模型連線」。這是第一次玩真正需要做的主要設定；敘事、玩家身份（Persona）與記憶可以先沿用預設值。": ["进入快速开始后，先选“使用夜湾灯火”或“使用自己的模型连接”。第一次玩只需完成这项主要设置；叙事、玩家身份与记忆可以先使用默认值。", "In Quick start, choose YoruBay Lights or your own model connection. You can leave narrative, persona and memory options at their defaults."],
    "使用夜灣燈火": ["使用夜湾灯火", "Use YoruBay Lights"],
    "如果這個選項目前有開放，登入夜灣帳號後直接選模型即可，不需要貼自己的連線金鑰。實際可用模型與燈火以帳號頁顯示為準。": ["如果目前开放此选项，登录夜湾账号后直接选模型即可，无需自己的 API Key。实际可用模型与灯火以账号页为准。", "If available, sign in and choose a model without entering your own API key. Availability and credits appear on your account page."],
    "登入／查看我的燈火 →": ["登录／查看我的灯火 →", "Sign in / view Lights →"],
    "使用自己的模型連線": ["使用自己的模型连接", "Use your own model connection"],
    "選擇模型服務（Provider）和模型（Model），再貼上同一家服務商的連線金鑰（API Key）。不同服務商的金鑰不能混用。": ["选择服务商和模型，再粘贴该服务商的 API Key。不同服务商的密钥不能混用。", "Choose a provider and model, then enter an API key from the same provider. Keys cannot be mixed across providers."],
    "還沒有 Key，可以到服務商官方頁面建立：": ["还没有 Key，可以到服务商官网创建：", "No API key yet? Create one on the provider's official site:"],
    "我想用 LM Studio 本機模型": ["我想用 LM Studio 本地模型", "I want to use LM Studio locally"],
    "「模型」是什麼？": ["“模型”是什么？", "What is a model?"],
    "模型（Model）就是實際接續故事內容的服務核心。先選你目前帳號或服務商可使用的模型。免費模型也可能有次數、地區或速率限制；付費模型可能產生費用。": ["模型是实际续写故事内容的服务核心。选择你的账号或服务商支持的模型。免费模型也可能有次数、地区或速率限制；付费模型可能收费。", "The model generates your story's next response. Choose one your account can access. Free models may have limits; paid models may incur charges."],
    "按「開始故事」": ["点“开始故事”", "Select Start story"],
    "夜灣燈火選好模型、自己的模型連線完成設定，或 LM Studio 成功讀到本機模型後，直接按「開始故事」。快速開始不需要先走完五個進階步驟；想調整敘事、Persona 或記憶時，再切到「完整設定」。": ["选择夜湾灯火模型、配置自己的连接，或 LM Studio 成功读取本地模型后，直接点“开始故事”。快速开始不必完成五个高级步骤；需要时可切到完整设置。", "Once your Lights model, personal API connection or LM Studio model is ready, select Start story. Quick start skips the five advanced steps; use Full setup if you want more controls."],
    "回夜灣開始玩 →": ["回夜湾开始玩 →", "Back to YoruBay →"],
    "開始前記得兩件事": ["开始前记住两件事", "Two things before you start"],
    "連線金鑰（API Key）不要放進角色卡、公開訊息或截圖。模型使用量可能由服務商收費，免費不代表無限使用。": ["不要把 API Key 放进角色卡、公开消息或截图。服务商可能按模型用量收费，免费不等于无限使用。", "Never put your API key in a character card, public post or screenshot. Model usage may incur charges; free does not mean unlimited."],
    "故事主要保存在這台裝置；聊天內容仍會送到你選擇的 AI 服務商。清除瀏覽器資料或換裝置前，請先備份故事。": ["故事主要保存在本设备；聊天内容仍会发送给你选择的 AI 服务商。清除浏览器或更换设备前请备份。", "Stories are mainly stored on this device; chats are sent to your chosen AI provider. Back up before clearing browser data or switching devices."],
    "卡住了怎麼辦？": ["卡住了怎么办？", "Need help?"],
    "金鑰無效：": ["密钥无效：", "Invalid API key:"],
    "模型不能用：": ["模型不可用：", "Model unavailable:"],
    "要自己設定連線網址：": ["要自己设置连接网址：", "Custom connection URL:"],
    "看完整連線說明（API）↗": ["查看完整连接说明（API）↗", "Full API connection guide ↗"],
    "回首頁": ["回首页", "Back to home"],

    "帳號與額度": ["账号与额度", "Account & credits"],
    "正在確認帳號狀態…": ["正在检查账号状态…", "Checking account…"],
    "故事優先保存在目前裝置。": ["故事优先保存在当前设备。", "Stories are saved on this device first."],
    "先捏好常用的玩家角色與 AI 人物／NPC；開始故事前或故事進行中都能直接帶入。": ["先创建常用的玩家角色与 AI 人物／NPC；故事开始前或进行中都能直接带入。", "Create player personas and NPCs to use before or during a story."],
    "遊玩統計偏好": ["游玩统计偏好", "Usage analytics preferences"],
    "協助改善遊玩體驗（不傳送對話）": ["协助改善游玩体验（不发送对话）", "Help improve play (no chat data)"],
    "了解統計": ["了解统计", "About analytics"],
    "隱私權": ["隐私权", "Privacy"],
    "服務條款": ["服务条款", "Terms"],
    "創作者政策": ["创作者政策", "Creator policy"],
    "年齡與內容": ["年龄与内容", "Age & content"],
    "燈火與退款": ["灯火与退款", "Lights & refunds"],
    "作品介紹": ["作品介绍", "Works"],
    "燈火方案": ["灯火方案", "Lights"],
    "回覆設定": ["回复设置", "Reply settings"],
    "⚙ 回覆設定": ["⚙ 回复设置", "⚙ Reply settings"],
    "🧠 記憶管理": ["🧠 记忆管理", "🧠 Memory"],
    "✦ 聊天外觀": ["✦ 聊天外观", "✦ Chat appearance"],
    "回覆長度": ["回复长度", "Reply length"],
    "快速推進 · 約 300～600 字": ["快速推进 · 约 300～600 字", "Quick scenes · around 300–600 Chinese characters"],
    "完整描寫 · 約 900～1500 字": ["完整描写 · 约 900～1500 字", "Full scenes · around 900–1500 Chinese characters"],
    "依場景密度調整": ["依场景密度调整", "Adjust to the scene"],
    "沒有設定時採第三人稱": ["未设置时使用第三人称", "Third-person by default"],
    "旁白「我」＝ AI 主要角色": ["旁白“我”＝ AI 主要角色", "Narrator “I” = main AI character"],
    "旁白「你／妳」＝玩家": ["旁白“你”＝玩家", "Narrator “you” = player"],
    "雙方使用名稱或代詞": ["双方使用名称或代词", "Use names or pronouns"],
    "角色名稱：「對話」": ["角色名称：“对话”", "Name: dialogue"],
    "控制輸出密度，不影響記憶模式。短適合快速對話；長要求完整場景；自動會依日常、戰鬥、轉折等情況調整。": ["控制输出密度，不影响记忆模式。短适合快速对话；长要求完整场景；自动依日常、战斗、转折等情况调整。", "Adjusts response length without changing memory. Short for quick scenes, long for richer scenes, automatic for context."],
    "「角色第一人稱」中的我固定是 AI 主要角色；「玩家第二人稱」中的你／妳固定是玩家 Persona。": ["“角色第一人称”中的我固定是 AI 主要角色；“玩家第二人称”中的你固定是玩家 Persona。", "In first-person, “I” is the AI character; in second-person, “you” is the player persona."],
    "這只控制台詞標示方式，與敘事人稱分開。玩家台詞的補述依「今晚的故事」演繹授權。": ["仅控制台词标示方式，与叙事人称分开。玩家台词的补述依“今晚的故事”演绎授权。", "Changes dialogue labels independently of narrative perspective. Player dialogue follows the portrayal authorization in Tonight’s story."],
    "敘事人稱": ["叙事人称", "Narrative perspective"],
    "對話格式": ["对话格式", "Dialogue format"],
    "AI 回覆語言": ["AI 回复语言", "AI response language"],
    "網站介面語言": ["网站界面语言", "Website interface language"],
    "網站介面語言僅影響選單、按鈕與操作文字；不修改角色卡、故事、玩家輸入或 AI 回覆。": ["网站界面语言只影响菜单、按钮与操作文字；不修改角色卡、故事、玩家输入或 AI 回复。", "Changes menus, buttons and interface labels only. It never changes cards, stories, player input or AI replies."],
    "只控制之後由模型生成的敘事與對話，不翻譯網站介面、歷史訊息或既有角色卡。語言變更從下一次送出訊息開始生效。": ["仅控制模型之后生成的叙事与对话，不翻译网站界面、历史消息或现有角色卡。更改从下一次发送消息起生效。", "Controls newly generated AI narration and dialogue. Does not translate the website, past messages or character cards. Applies from the next turn."],
    "完成": ["完成", "Apply"],
    "取消": ["取消", "Cancel"],
    "關閉": ["关闭", "Close"],
    "英文": ["英文", "English"],
    "簡體中文": ["简体中文", "Simplified Chinese"],
    "繁體中文": ["繁体中文", "Traditional Chinese"],
    "短": ["短", "Short"],
    "長": ["长", "Long"],
    "自動": ["自动", "Auto"],
    "跟角色卡走": ["跟角色卡走", "Use character card"],
    "角色第一人稱": ["角色第一人称", "Character first-person"],
    "玩家第二人稱": ["玩家第二人称", "Player second-person"],
    "第三人稱": ["第三人称", "Third-person"],
    "名稱標示": ["名称标示", "Name labels"],
    "夜灣首頁": ["夜湾首页", "YoruBay home"],
    "介面語言": ["界面语言", "Interface language"],
    "回覆語言": ["回复语言", "Response language"],
    "目前沒有手動存檔。": ["当前没有手动存档。", "No manual saves yet."]
  });

  const INDEX = new Map();
  for (const [original, values] of Object.entries(dictionary)) {
    for (const candidate of [original, ...values]) {
      if (candidate && !INDEX.has(candidate)) INDEX.set(candidate, original);
    }
  }
  const normalize = code => SUPPORTED.includes(code) ? code : DEFAULT;
  const readLocale = () => {
    try { return normalize(localStorage.getItem(KEY)); } catch { return DEFAULT; }
  };
  let locale = readLocale();
  const t = key => {
    const original = INDEX.get(String(key)) || String(key);
    const translations = dictionary[original];
    return !translations ? String(key) : (locale === "zh-Hans" ? translations[0] : locale === "en" ? translations[1] : original);
  };

  // Protect content that belongs to players/authors or can include LLM output.
  const SKIP = "#chat-stream, #character-list, #character-detail, #chat-character-card, #ui-panel, " +
    "#chat-persona, #chat-model, #chat-title, #home-feature-name, #home-feature-title, " +
    "#home-local-story-name, #home-local-story-preview, #home-character-preview, " +
    ".brand-paper-prose, .message, .yb-recovery, .yb-wallet, .yb-usage-list, " +
    "[contenteditable], [data-i18n-skip], " +
    "script, style, noscript, code, pre, textarea";
  const ROOTS = ".topbar, .author-topbar, #bao-mobile-nav, #home-view, #explore-view, #builder-view, #me-view, #chat-view, " +
    ".app-shell > footer, .bao-player-modal, .yb-wrap, body.bao-brand-document > main, body > header";
  const originalNodes = new WeakMap();
  const originalAttributes = new WeakMap();

  const isSkipped = node => Boolean(node?.parentElement?.closest?.(SKIP));
  const translateTextNode = node => {
    if (!node || node.nodeType !== 3 || isSkipped(node)) return;
    const raw = node.nodeValue || "";
    const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match || !match[2]) return;
    const previous = originalNodes.get(node);
    const original = previous && raw === previous.rendered
      ? previous.original : INDEX.get(match[2]);
    if (!original) return;
    const translated = match[1] + t(original) + match[3];
    originalNodes.set(node, { original, rendered: translated });
    if (raw !== translated) node.nodeValue = translated;
  };
  const translateAttributes = element => {
    if (!element || element.nodeType !== 1 || element.closest?.(SKIP)) return;
    for (const attr of ["placeholder", "title", "aria-label"]) {
      if (!element.hasAttribute?.(attr)) continue;
      const value = element.getAttribute(attr);
      let entries = originalAttributes.get(element);
      if (!entries) { entries = {}; originalAttributes.set(element, entries); }
      const record = entries[attr];
      const original = record && record.rendered === value ? record.original : INDEX.get(value);
      if (!original) continue;
      const translated = t(original);
      entries[attr] = { original, rendered: translated };
      if (translated !== value) element.setAttribute(attr, translated);
    }
  };
  const translateTree = root => {
    if (!root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
    // A bare <option> uses its visible text as the form value. Never change that value.
    if (root.tagName === "OPTION" && !root.hasAttribute("value")) return;
    translateAttributes(root);
    for (const child of Array.from(root.childNodes || [])) translateTree(child);
  };
  const scan = () => {
    for (const root of document.querySelectorAll(ROOTS)) translateTree(root);
  };
  const titleForLocale = () => t("介面語言");
  const mount = () => {
    if (document.querySelector("[data-yorubay-locale-switch]")) return;
    const target = document.querySelector(".topbar, .author-topbar-actions, .yb-top, body > header");
    if (!target) return;
    const wrapper = document.createElement("label");
    wrapper.className = "yorubay-locale-switch";
    wrapper.setAttribute("data-yorubay-locale-switch", "");
    const label = document.createElement("span");
    label.textContent = titleForLocale();
    label.className = "yorubay-locale-label";
    const select = document.createElement("select");
    select.setAttribute("aria-label", titleForLocale());
    select.setAttribute("data-ui-locale-select", "");
    for (const [value, name] of [["zh-Hant", "繁體中文"], ["zh-Hans", "简体中文"], ["en", "English"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name;
      select.appendChild(option);
    }
    select.value = locale;
    select.addEventListener("change", () => setLocale(select.value));
    wrapper.appendChild(label);
    wrapper.appendChild(select);
    target.appendChild(wrapper);
  };
  const refreshSwitcher = () => {
    for (const select of document.querySelectorAll("[data-ui-locale-select]")) {
      select.value = locale;
      if (select.getAttribute("aria-label") !== titleForLocale()) select.setAttribute("aria-label", titleForLocale());
    }
    for (const label of document.querySelectorAll(".yorubay-locale-label")) {
      if (label.textContent !== titleForLocale()) label.textContent = titleForLocale();
    }
  };
  const apply = () => {
    document.documentElement.lang = locale;
    scan();
    refreshSwitcher();
  };
  const setLocale = (value, persist = true) => {
    const next = normalize(value);
    locale = next;
    if (persist) {
      try { localStorage.setItem(KEY, next); } catch { /* storage blocked: runtime preference still works */ }
    }
    apply();
    window.dispatchEvent?.(new CustomEvent("yorubay:interface-language-change", { detail: { locale: next } }));
    return next;
  };
  const start = () => {
    mount();
    apply();
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if (mutation.type !== "childList") continue;
          // Child-only listening avoids mutation loops and stays cheap during streaming.
          const parent = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
          if (parent?.closest?.(SKIP)) continue;
          const relevant = parent?.closest?.(ROOTS) || parent?.matches?.(ROOTS);
          for (const node of mutation.addedNodes) {
            if (relevant) { translateTree(node); continue; }
            // A modal or a new My-space view may be mounted outside existing roots.
            if (node.nodeType !== 1) continue;
            if (node.matches?.(ROOTS)) translateTree(node);
            for (const inner of node.querySelectorAll?.(ROOTS) || []) translateTree(inner);
          }
        }
        if (!document.querySelector("[data-yorubay-locale-switch]")) mount();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  };
  window.BAOSiteI18n = Object.freeze({
    storageKey: KEY, supported: SUPPORTED, getLocale: () => locale,
    setLocale, t, apply, mount
  });
  window.addEventListener?.("storage", event => {
    if (event.key === KEY) setLocale(readLocale(), false);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();