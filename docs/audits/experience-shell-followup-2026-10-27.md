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
| RPG Dashboard | 已有 | 1081px 起隱藏原 game-ui；自訂欄寬從 1430px 起 | 核對既有三欄骨架、1430px 欄寬覆蓋與舞臺入口 |
| Scene RPG | 已有 | 大場景 CSS 從 1280px 起，以下 fallback | 以 1081–1279px 實際測試決定 contract |
| Phone | 已有獨立 renderer | overlay；僅明確 play_info_surface=phone 才作主要 Stage | 保留獨立 phone state、unlock 與舊卡 launcher |
| Visual Novel | 尚無正式 preset | 尚未建立 | 先定義場景／對話／選項及手機 fallback，再開放 Creator/MCP |

## UX 問題與優先順序

1. **搜尋任務被總覽擋住。** overview 在 search 上方；即使找不到工具，上方仍顯示大量無關設定卡。先消除搜尋中的競爭資訊。
2. **Modal 只有標籤，沒有完整操作邊界。** Tab 可以離開 Control；關閉後沒有回原入口。先補上隔離、循環焦點及焦點復原。
3. **Control 有重複導航層。** overview 的更多設定、分類 details、mobile quick 的更多快捷操作，同時描述相近能力。下一批以「摘要 landing／找工具」兩個任務重排，同時保留搜尋與原代理按鈕；不要再加外層摺疊。
4. **Stage contract 與 CSS breakpoint 不完全一致。** Scene 的桌機 preset 需要 1081、1279、1280px 對照；RPG 另需檢查 1430px 欄寬變化。單純新增 preset 無法解決此問題。
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
3. **Stage responsive contract。** Reader、RPG、Scene、Terminal、explicit/optional Phone，跨 820/821、1080/1081、1279/1280、1429/1430 檢查實際呈現、焦點與退場。先對齊既有能力再新增 VN。
4. **Builder progressive disclosure。** 無需先調記憶／進階 Provider 就能開始；讀取舊存檔、BYOK key 不落盤、Prompt feature 生效測試必須維持。
5. **VN 平台 renderer。** 定義 schema 與 action 邊界、版本與 fallback，再更新作者工作檯及 MCP；不允許任意 JS／DOM／API Key。

## 相容與驗證範圍

不修改角色卡、存檔、Prompt assembler、GameState、memory、API/BYOK 模組與 schema。新增 browser regression 直接操作正式入口，檢查三種尺寸、搜尋、鍵盤及前後資料一致性；既有 navigation intent 測試驗證搜尋後仍能到原長期指令 editor。另跑 Stage／Gameplay core、Context Pack wrapper 與 production security checks。測試執行結果以 PR 說明為準，不把環境無法啟動誤記為產品測試通過。

## 接續實作：控制中心依任務分區

同一 PR 延伸第一批修正，控制中心現在有兩個互斥呈現的目的地：

- **目前設定**：直接顯示目前故事的設定與生效狀態，保留原有常用摘要、更多設定及原 manager 路由。拿掉最外層 overview 摺疊，避免先展開外層才能看到內層工具。
- **全部工具**：呈現分類工具與手機常用操作；不混入設定總覽卡。

分區與搜尋固定在 dialog 上方，只有內容區捲動。輸入搜尋時暫時呈現工具結果，清空後回先前分區並保留 disclosure 狀態。手動選擇分區會清除搜尋並回到該分區頂端。手機移除重複的「目前故事設定」快捷，使用同一「目前設定」分區。

`BAOStoryControlCenter.open({effects:true})` 等既有呼叫，透過 `BAOChatToolNavigation.showView('overview')` 切換同一份已掛載內容，不關閉重開 dialog。未進故事而沒有 overview 時，設定分區停用，工具仍可用。分區狀態只存在 dialog closure，沒有新增故事設定、儲存或 Prompt 資料。

說明視窗可開在控制中心上方，其 Escape 只關閉說明並回原說明按鈕，不再連帶關閉控制中心。父層 focus trap 不攔截上層 dialog 的鍵盤事件。

新增 390／900／1440px 分區回歸：確認 summary／工具互斥、無外層摺疊、搜尋清除還原、保留同一個 dialog 與內層展開狀態、既有 effects 路由可回摘要。既有手機歷程、上下文、擴充與請求證據測試改走單一分區入口。角色卡、存檔、世界狀態、記憶、Prompt 與 BYOK 邊界沿用前述不變條件。


## 接續實作：Stage responsive contract

實作確認 generic Play CSS 會覆蓋作品的 grid／隱藏 dashboard aside。現以 shell-specific Play selectors 確定 Terminal 兩欄、Scene 兩欄、RPG 三欄，設定仍留控制中心。Stage adapter 依實際寬度選 persistent／按需模式，並將 aria-controls 指向可見 host；RPG 缺少有效 layout panel 時保留一般 panel。詳細門檻、resize 與驗證條件見 `docs/stage-capability-contract.md`。


## 接續實作：Builder progressive disclosure runtime

Stage responsive contract 完成後，重新核對主線發現 `js/quick-start-mode.js` 仍保留完整的快速開始／完整設定切換、特殊世界 fallback、進階連線欄位 disclosure 與既有設定值保留邏輯，但 `site-ui.js` 的 Player 2.0 載入鏈沒有載入它。結果是原本已做好的漸進式 Builder 只能存在於檔案與測試假設中，正式入口仍可能退回五步技術流程。

本批不新增第二套 Builder，也不改 `App.collectConfig()`、`App.startStory()`、Storage、Prompt、Memory 或 BYOK。只把既有 quick-start presentation 接回正式 runtime：

- `player-builder-v2` 後載入 `quick-start-mode`，再由 `story-start-readiness` 裝飾同一個 Builder。
- 一般作品預設只呈現「作品已選好 → 模型連線 → 開始故事」；敘事、顯示、Persona、記憶沿用既有預設值。
- 玩家可隨時切回完整設定，既有值不重置；舊流程若明確呼叫 `App.setStep(...)` 會自動保留 advanced 行為。
- `autonomous-npc-world` 等需要先選世界開局的特殊作品仍強制完整設定，不被快速流程跳過。
- 新增核心載入契約，防止未來調整 loader 時再次讓 quick-start 檔案成為孤兒。

這一批仍屬 UI/UX presentation wiring；沒有新增作者 JS、DOM selector、網路權限、API Key 讀取能力或新的故事資料欄位。

## 接續實作：Story handoff 與常駐工具收斂

Builder progressive disclosure 接回主線後，下一個殘留層級在 Story 入口。主線已經每輪自動儲存，但舊工具導覽仍會先建立一條「快速儲存／舞臺／控制中心」fallback strip；在目前 Experience Shell 中，Story Surface 已經提供正式的 Story／Stage／Control Center 語意導航，因此這條 strip 只會形成第二層導航。桌機 sidebar 的手動快速儲存也被放在 quick actions，而不是故事管理工具。

本批只調整 presentation 與工具歸類：

- Story Surface 一旦掛載正式 Story／Stage／Control Center 導覽，立即讓舊 tool navigation 重新同步並移除 fallback strip。
- chat-tool-navigation 若已看到正式 surface controls，就不再建立舊 shortcut strip；只有混合快取／舊頁面缺少正式 controls 時保留 fallback。
- 原本的「快速儲存」按鈕保留原 handler，但移入「故事與記憶」工具群；桌機／平板從 Control Center 的「全部工具」存取，手機仍保留既有「更多快捷操作」入口。
- App.saveStory(false) 的開始故事、每輪提交與離開故事自動儲存完全不變。
- Builder → Story 回歸新增驗收：開始後必須是 play/story，Stage 關閉、Control Center 關閉、舊 shortcut strip 不存在。

這一批不修改 Storage payload、存檔格式、Prompt、GameState、Memory、BYOK、Gameplay schema 或作者權限。目的只有一個：進入故事後，畫面只留下故事本身與正式的 Stage／Control 入口，不再為已自動執行的儲存工作常駐第二層 chrome。
