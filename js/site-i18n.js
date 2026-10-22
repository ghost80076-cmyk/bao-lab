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
    "首頁": ["首页", "Home"],
    "作品": ["作品", "Stories"],
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
    "這只控制台詞標示方式，與敘事人稱分開。AI 不會因此替玩家編造台詞。": ["仅控制台词标示方式，与叙事人称分开。AI 不会因此替玩家编造台词。", "Changes dialogue labels independently of narrative perspective; the AI must not invent player dialogue."],
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
    "#chat-persona, #chat-model, #home-feature-name, #home-feature-title, " +
    "#home-local-story-name, #home-local-story-preview, #home-character-preview, " +
    ".brand-paper-prose, .message, [contenteditable], [data-i18n-skip], " +
    "script, style, noscript, code, pre, textarea";
  const ROOTS = ".topbar, .author-topbar, #home-view, #explore-view, #builder-view, #me-view, #chat-view, " +
    ".app-shell > footer, .bao-player-modal, .author-page-shell > header, body > header";
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
    translateAttributes(root);
    for (const child of Array.from(root.childNodes || [])) translateTree(child);
  };
  const scan = () => {
    for (const root of document.querySelectorAll(ROOTS)) translateTree(root);
  };
  const titleForLocale = () => t("介面語言");
  const mount = () => {
    if (document.querySelector("[data-yorubay-locale-switch]")) return;
    const target = document.querySelector(".topbar, .author-topbar-actions, body > header");
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
      select.setAttribute("aria-label", titleForLocale());
    }
    for (const label of document.querySelectorAll(".yorubay-locale-label")) label.textContent = titleForLocale();
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