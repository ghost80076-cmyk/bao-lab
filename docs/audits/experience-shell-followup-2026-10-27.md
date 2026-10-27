# Experience Shell：主線承接稽核與第一批修正

基線：`f30a4c22`（main，PR #853 已合併）。本文件承接同日的 Experience Shell 稽核；舊文件是 Phase 1 當時的快照，不能當成目前功能清單。

## 目前的產品結構

| 區域 | 實際來源 | 應負責的任務 | 稽核結果 |
| --- | --- | --- | --- |
| 原始聊天頁 | index.html | 相容 DOM、故事本文、輸入、原生 game-ui | 同時保留 sidebar、存檔、meta、usage；呈現由 enhancement 決定，不能直接刪除隱藏 DOM |
| Player Shell | player-shell-v2.js/css | 全站目的地、我的、閱讀視覺 | 已有 Story／Stage／Control 語意，無需第二個 router |
| Story Surface | bao-visual-ui.js/css | 三個區域的開關、場景時間／地點 | control visibility event 已承接 active state；返回 Story 不需改故事資料 |
| Stage resolver | stage-capability-core.js、stage-capability.js | 依合法作品能力選擇平台 renderer | 純判斷／安全 adapter，不應讀取連線資訊或寫入存檔 |
| Gameplay UI | gameplay-ui-core.js、gameplay-ui.js/css | schema 正規化、受控 state binding、作品互動 | Terminal 已有；按鈕仍填入草稿，不能直接提交模型請求 |
| Reader Context | reader-context.js/css | 目前場景、人物、世界與記憶的閱讀資訊 | 是按需舞臺，不是狀態設定編輯器 |
| Story Tools | story-tools.js/css | 故事書庫、備份、Context Pack、續篇 | 有自己的獨立 modal；本批不更動其匯入與 Prompt wrapper |
| Control Center | story-control-center.js/css | 設定摘要、轉到原 manager | 內嵌於 tool drawer；常用五卡、更多設定及生效狀態形成多層 disclosure |
| Tool navigation | chat-tool-navigation.js/css | 分類、搜尋、代理原按鈕 | 原 manager 唯一；搜尋卻未隱藏 overview，modal 未限制鍵盤焦點 |
| Mobile reading | mobile-reading-layout.js/css | 手機閱讀、鍵盤、composer、常用工具 | 以＋開 Control，另 prepend quick hub；與 overview／分類重複呈現類似任務 |
| 延遲載入 | site-ui.js | enhancement 次序與 cache URL | 本批更新 loader 與 index 引用，避免只改子檔版本 |

另外核對 `chat-experience`、`story-reader`、`story-control-center`、`reader-context`、`player-shell-v2`、`gameplay-ui`、`chat-tool-navigation`、`mobile-reading-layout` 的責任邊界。現有 theme／mobile 高 specificity 覆蓋仍多；以 CSS 檔案數量本身判定 UX 品質並不充分。

## 現有 shell 評估

| Shell | 主線狀態 | 桌機／窄螢幕 | 下一個具體工作 |
| --- | --- | --- | --- |
| Reader／standard | 已有 | Reader Context sheet／game-ui panel | 保留本文與輸入為主，避免加入設定 |
| Terminal | PR #853 已有 | 1081px 起 persistent，以下按需 panel | 用現有 panels／安全 actions，無需作者 JS |
| RPG Dashboard | 已有 | 多欄 CSS 從 1280px 起，窄版保留原 game-ui | 對齊 resolver 的 desktop embedded 宣告與實際 breakpoint |
| Scene RPG | 已有 | 大場景 CSS 從 1280px 起，以下 fallback | 同上；以 1081–1279px 實際測試決定 contract |
| Phone | 已有獨立 renderer | overlay；僅明確 play_info_surface=phone 才作主要 Stage | 保留獨立 phone state、unlock 與舊卡 launcher |
| Visual Novel | 尚無正式 preset | 尚未建立 | 先定義場景／對話／選項及手機 fallback，再開放 Creator/MCP |

## UX 問題與優先順序

1. **搜尋任務被總覽擋住。** overview 在 search 上方；即使找不到工具，上方仍顯示大量無關設定卡。先消除搜尋中的競爭資訊。
2. **Modal 只有標籤，沒有完整操作邊界。** Tab 可以離開 Control；關閉後沒有回原入口。先補上隔離、循環焦點及焦點復原。
3. **Control 有重複導航層。** overview 的更多設定、分類 details、mobile quick 的更多快捷操作，同時描述相近能力。下一批以「摘要 landing／找工具」兩個任務重排，同時保留搜尋與原代理按鈕；不要再加外層摺疊。
4. **Stage contract 與 CSS breakpoint 不完全一致。** RPG／Scene 的桌機 preset 需要 1081、1279、1280px 對照。單純新增 preset 無法解決此問題。
5. **Builder 仍有五步技術流程。** 先保留 quick／advanced、已有 BYOK／燈火分流；後續把首次必需輸入與可延後設定分離，維持既有 config restore。
6. **視覺覆蓋權責分散。** 下一步應逐個 surface 指定 layout owner，刪除有證據的過期規則；避免新加一張全域 stylesheet 壓過所有舊規則。

## 本批實作

直接修改既有 `chat-tool-navigation.js`，不新增 router、renderer 或設定存放層：

- 搜尋非空時隱藏內嵌 overview 與介紹；清空後回到相同 DOM，保留 overview／更多設定的 open 狀態。
- Control 開啟時暫存 body 既有兄弟節點的 inert 值並隔離背景；關閉時還原。原本 inert 的節點保持 inert。
- Tab／Shift+Tab 依目前可見、可操作的元件循環，涵蓋搜尋過濾、摺疊與 mobile enhancement。
- Escape、關閉、背景點擊共用同一 cleanup，關閉後回原入口；代理開啟 manager 前先清掉 inert，既有 editor 可正常取得焦點。
- 維持既有 aria-label 相容性，不強制同步改名造成其他入口／測試斷裂。
- 更新 site-ui loader 與 index cache URL。

## 後續漸進方案與驗收

1. **本批：搜尋與操作邊界。** 手機 390、平板 900、桌機 1440px 驗證查找／清除／關閉／焦點復原，確認 config、GameState、messages 不變。
2. **Control landing 重排。** 先保留常用模型／身份／記憶摘要；進入搜尋即顯示工具結果；再移除同任務重複快捷。需保留世界書、存檔清單、顯示 select 的原 handler，測試由各入口進出 manager。
3. **Stage responsive contract。** Reader、RPG、Scene、Terminal、explicit/optional Phone，跨 820/821、1080/1081、1279/1280 檢查實際呈現、焦點與退場。先對齊既有能力再新增 VN。
4. **Builder progressive disclosure。** 無需先調記憶／進階 Provider 就能開始；讀取舊存檔、BYOK key 不落盤、Prompt feature 生效測試必須維持。
5. **VN 平台 renderer。** 定義 schema 與 action 邊界、版本與 fallback，再更新作者工作檯及 MCP；不允許任意 JS／DOM／API Key。

## 相容與驗證範圍

不修改角色卡、存檔、Prompt assembler、GameState、memory、API/BYOK 模組與 schema。新增 browser regression 直接操作正式入口，檢查三種尺寸、搜尋、鍵盤及前後資料一致性；既有 navigation intent 測試驗證搜尋後仍能到原長期指令 editor。另跑 Stage／Gameplay core、Context Pack wrapper 與 production security checks。測試執行結果以 PR 說明為準，不把環境無法啟動誤記為產品測試通過。
