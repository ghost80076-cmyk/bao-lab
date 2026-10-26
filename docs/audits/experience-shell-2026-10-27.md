# 夜灣 Experience Shell UI/UX 稽核與漸進重構

日期：2026-10-27  
範圍：main 的 `index.html`、Player Shell、Story Surface、Gameplay UI、Story Tools、Story Control Center、Chat Tool Navigation、Mobile Reading Layout 與相關 CSS/JS。

## 目標

不是把 WORLD-0317 的色彩或視覺語言搬入夜灣，而是把它驗證出的產品原則導入既有架構：

1. 遊玩與設定分離。
2. 一個畫面只有一個主要目的。
3. 重要資訊常駐；次要功能按需求出現。
4. 作者的作品資料與平台控制面分離。
5. 保留 Gameplay UI schema、安全 renderer、現有角色卡與存檔相容性。
6. 不開放作者任意 JavaScript、DOM、API Key 或故事存儲權限。
7. 不重寫 Prompt 組裝、Memory、World State、BYOK 或 Provider 連線。

## 現況稽核

### 1. 底層其實已經比表面 UI 整齊

目前主線已有幾個正確的基礎：

- `chat-tool-navigation.js` 已把工具按玩家意圖分為「人物與世界 / 故事與記憶 / AI 與指令 / 畫面與操作 / 其他與支援」。
- Story Control Center 的卡片全部轉呼叫既有 manager；沒有第二份模型、記憶或 Prompt state。
- Gameplay UI 是 opt-in schema renderer。沒有 `gameplay_ui` 的舊卡維持既有行為。
- Gameplay UI action 只 draft 到玩家輸入欄，不自動送出。
- 作者 schema 只能讀取安全的 `time/location/events/npcs/modules.*` 等狀態；不能任意執行 JS、讀 API Key、控制 DOM 或讀完整故事存儲。
- mobile reading 已把大部分高階工具移出主要閱讀面。

因此這次重構不需要重造資料架構，主要問題是「相同能力被多個表面入口暴露」。

### 2. index.html 同時承擔 Story、Stage 與 Control 的舊骨架

聊天頁的原生 DOM 同時存在：

- 左側角色卡與故事 meta。
- 快速儲存 / 另存 / 管理 / 匯入。
- Gameplay tabs：人物 / 狀態 / 事件 / 記憶。
- Token、快取與記憶 usage bar。
- Composer。

後續 enhancement 又會加入：

- 世界狀態。
- 故事總覽。
- 模型連線。
- 玩家設定。
- Narrative / Memory / Context / Worldbook / Regex / Story Extensions。
- Gameplay dashboard / scene layout。
- Mobile drawer。

所以 DOM 的「原始能力」沒有錯，但所有能力容易被同時理解為遊玩介面。

### 3. 重複層級

主線可觀察到的重複入口包括：

- Story Surface header 的「資訊」。
- Story Control Center 額外注入的「故事」。
- Story Surface 的「工具」。
- Chat Tool Navigation 另外產生的「狀態欄管理 / 全部功能 / 快速儲存」捷徑。
- Desktop sidebar 另外產生一顆「狀態欄管理」。
- Sidebar semantic group 裡又有真正的狀態管理按鈕。
- Game UI 本身另有「人物 / 狀態 / 事件 / 記憶」。
- Mobile drawer 再有「故事總覽 / 人物事件 / 記憶 / 世界狀態」。

這些大多沒有第二份 state，但玩家看到的是多個看似同級的入口。

### 4. Play / Studio 已經是正確基礎，但命名仍是工程導向

`BAOStorySurface` 已經實現：

- Play：閱讀優先。
- Studio：顯示工具與進階控制。
- Info：依作品能力開 Reader Context 或 Gameplay UI。

這實際上已接近目標 IA：

- Play = Story。
- Info / Gameplay = Stage。
- Studio / Tool Drawer = Control Center。

第一階段因此不建立新 router，而是正式把既有行為映射到這三個產品概念。

### 5. Builder 仍混合「我要怎麼開始」與「技術設定」

建立故事目前有敘事、顯示、玩家、模型連線、記憶五步。這對首次連線仍有實際必要，但把故事選擇與 Provider / API / Memory implementation 放在同一層。

這是第二/三階段議題；第一階段不改 builder，避免改動 story creation、BYOK 與存檔 schema。

## 目標資訊架構

### Story

主要目的：閱讀、輸入下一句、看最必要的場景 context。

常駐：
- 作品 / 角色識別。
- 必要的時間、地點。
- 故事本文。
- Composer。
- 低干擾的回覆工具。

不常駐：
- API、Token、Memory 設定。
- 世界書、Regex、Prompt 工具。
- 存檔管理細節。
- 狀態 schema 編輯。

### Stage

主要目的：看「這個作品現在正在運行的世界 / 遊戲資訊」。

資料只來自現有安全來源。

可依作品套平台 shell：
- Standard / Reader Context。
- RPG Dashboard（既有）。
- Scene RPG（既有）。
- Terminal（後續）。
- Phone（既有 Phone framework，後續評估是否成為通用 shell）。
- Visual Novel（後續）。

Stage 不等於設定頁，也不取得 API Key。

### Control Center

主要目的：改變「怎麼玩」，而不是「現在故事發生什麼」。

集中：
- 模型 / BYOK route。
- 玩家 Persona。
- Narrative。
- Memory / Context。
- Quick Commands。
- Worldbook / Extensions。
- Display / Appearance。
- Save / Import / Export。
- Status schema 管理。

所有按鈕仍呼叫原本 manager；不建立第二份設定 state。

## Shell 評估

### Standard / Reader

狀態：已有。  
用途：單角、小說、一般世界卡。  
建議：Story 為主，Stage 使用 Reader Context 或原生 Game UI。

### RPG Dashboard

狀態：已有 declarative preset。  
優點：已共享 Gameplay schema、安全邊界與同一 GameState。  
建議：保留；後續把窄螢幕 fallback 定義為正式 Stage responsive contract，而非「桌機版失效」。

### Scene RPG

狀態：已有 declarative preset。  
用途：場景視覺 + 故事 + 世界資訊。  
建議：保留，視為 Stage shell，不把 scene 配置升格為任意作者 HTML/JS。

### Terminal

狀態：尚未定義通用 preset。  
用途：懸疑、科幻、系統流、WORLD-0317 類作品。  
建議：第二階段之後，以平台 renderer + schema section 組合實作。作者只能宣告安全資料與 action draft，不執行 JS。

### Phone

狀態：已有獨立 phone framework。  
用途：手機劇情、訊息、相簿、應用程式敘事。  
建議：先保留專用 renderer；後續只抽出共同 shell contract，不直接把整套 phone state 塞入 Gameplay UI v1。

### Visual Novel

狀態：尚未有正式 shell preset。  
用途：大場景圖、角色立繪、對話、選項。  
建議：建立平台控制的 Scene + Dialogue + Choice renderer。選項依舊 draft/confirm，不允許任意 script。

## 桌機資訊架構

第一階段：
- Header：故事 / 舞臺 / 控制中心。
- Story：Play surface。
- Stage：既有 Reader Context 或 Gameplay UI。
- Control Center：既有 Story Control Center + searchable tool drawer。
- Desktop sidebar 保留兼容 DOM，但移除額外「狀態欄管理」快捷副本；原管理器仍存在於分類工具。
- Tablet shortcut bar 改成「快速儲存 / 舞臺 / 控制中心」。

後續：
- Desktop sidebar 由「功能容器」逐步退成作品身份 + 少量 context；設定不再直接常駐。

## 手機資訊架構

手機螢幕不適合照搬三段式 header：

- Story 就是底層畫面，不再放「故事」按鈕。
- Header 保留一個「舞臺」入口。
- Composer `＋` 是 Control Center 入口。
- Control Center 內常用項目改為「目前故事設定 / 舞臺資訊 / 記憶 / 模型」。
- 其餘工具繼續 progressive disclosure。

這保留單手閱讀與原本 mobile viewport/keyboard 修復。

## 相容性不變條件

第一階段明確不改：

- Character schema。
- `gameplay_ui` schema version。
- GameState 結構。
- 故事存檔格式。
- Context Pack。
- Prompt Orchestrator。
- Memory pipeline。
- World Modules。
- API Key 存放與 Provider routing。
- Gameplay action draft 行為。
- 作者 rich message sanitize 邊界。
- 既有 RPG Dashboard / Scene RPG layout 判定。

## 分階段落地

### Phase 1 — Experience Shell vocabulary + entry consolidation（本 PR）

- 將現有 Story Surface 正式映射為 Story / Stage / Control Center。
- Desktop header 收斂成三個語意入口。
- Control Center 直接使用既有 Story Control Center / tool drawer。
- 移除重複的 header Story Overview 入口。
- 移除 desktop sidebar 額外產生的 Status Manager 快捷副本。
- Tablet shortcut 對齊 Stage / Control Center。
- Mobile `＋` 語意改為 Control Center；保留閱讀優先。
- 不改任何故事 state 或 Prompt behavior。

### Phase 2 — Stage adapter / capability map

建立平台端 shell capability resolver，例如：

```text
story -> reader
stage -> reader-context | standard | rpg-dashboard | scene-rpg | phone
control -> existing managers
```

將目前散落在 ReaderContext / Gameplay UI / phone 的顯示判定收斂，但不改資料 schema。

### Phase 3 — Control Center / Builder progressive disclosure

- 將首次必要連線與進階 Provider 設定分開。
- Builder 的故事選擇留在故事建立；技術設定轉到 Control Center。
- 維持 BYOK 安全與既有存檔 restore contract。

### Phase 4 — New declarative shells

在 Gameplay UI schema 的安全 renderer 之上評估：
- Terminal。
- Visual Novel。
- Phone shell adapter。

任何新 shell 都是平台-owned renderer，不接受作者任意 JS、任意 CSS selector、API Key 或 parent DOM access。

## 成功標準

- 玩家在遊玩畫面可回答：「我現在是在讀故事、看舞臺，還是在改設定？」
- 同一設定只有一個 canonical manager。
- 作者卡不需改資料即可繼續運行。
- Legacy cards 無 Gameplay schema 時不會突然多出作者 UI。
- RPG Dashboard / Scene RPG 測試維持。
- 手機沒有新增水平 overflow、鍵盤遮擋或重複 toolbar。
- 切換 Story / Stage / Control Center 不改動 API config、GameState 或聊天內容。
