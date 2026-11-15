# 場景轉譯完整度｜選配敘事強化（2026-11-14）

## 定位
在「今晚的故事 → 沿途風景」新增 `scene_fidelity`，預設關閉。沿用 `narrative.storyExtras` 白名單、去重、既有 checkbox UI、故事級儲存、摘要標籤和穩定 system Prompt；不新增第二套敘事管線、資料 schema、每輪 API 呼叫或額外狀態。

## 生效與邊界
- 聚焦本輪**已明示**的玩家言行、已確認的場景／人物關係／事件，轉譯為具體、可回應的下一刻。
- 有用才加入對話、動作、空間與感官線索；不是固定必填項，也不保證增加字數。
- 尊重作品人設、角色語言、視角、已確認事實、資訊隔離、玩家演繹授權、故事節奏與回覆篇幅；保留自然接話空間。
- 與 `motivation`／`flexibility` 可並用；三者分工：本項處理當前互動的具體呈現、`motivation` 管目標延續、`flexibility` 管表現變化。各自只加入一條規則，避免額外重複整套角色／世界要求。
- 不替玩家決定重大行動，不預設 NPC 情緒或關係結果，不為湊細節新增事件、跳時或強制延長互動。
- 不改供應商內容政策、模型取樣參數、記憶／狀態／世界書、回溯分支、金流計價或既有角色卡。

## 驗證
```bash
node tests/narrative-settings-core.cjs
node tests/narrative-prompt-pipeline-core.cjs
```

兩套測試涵蓋：舊故事預設不生效、選項去重／未知 key 過濾、偏好顯示、與 `motivation`／`flexibility` 共存、內心揭露與節奏相容、Gemini／Claude 穩定 system 前綴、取消選項後請求回到原本位元組。CI 額外執行跨功能回歸與瀏覽器測試。

這些測試只驗證 Prompt 組裝契約，不宣稱模型實聊品質已改善。後續可在相同故事／模型／參數下盲評具體度、連續性、額外事件、玩家主權、字數與 Token 成本。

## 回退
移除 `extras.scene_fidelity` 與本次文件／測試即可。舊存檔中的未知 `scene_fidelity` 會被既有 `validExtras` 忽略，不需要資料遷移；正式站未因本 PR 自動部署。

## 最終整合驗收範圍（2026-11-15）
- 整合 #960 後的 main；補上 narrative-settings v18 與 site-ui v208 的載入鏈，避免舊快取漏掉選項。
- 「不新增無依據的事件或關係」限定無依據擴寫，合理 NPC 行動仍依平台既有自主／因果規則；作品文風與內心描寫設定仍適用。不重複加入平台已有的資訊隔離、重大決策與狀態規則。
- Pipeline Mock 增加 Gemini、Claude、OpenRouter 泛用路由、本地 OpenAI-compatible 路由，三選項全部 8 種組合、作者第一／第三人稱約束、text／ui config、重生成的獨立歷史與設定 JSON 往返。這是組裝契約，並非所有供應商的真實 API 測試。
- 既有 narrative-cache-preservation E2E 增加手機／桌面草稿取消、快速勾選、開關、真實 Storage 寫入、頁面重新載入及還原；舊故事不會因未變更儲存而新增 narrative 欄位。
- Scene fidelity acceptance CI 在 Chromium／Firefox／WebKit 執行上述規格及 tonight-story、narrative-blunt-style、story-rollback。回溯／分支一般契約由既有測試補驗；組裝層驗證切換 config 後不殘留選項，不代表正在生成中的請求會被追溯修改。
- Token 增量只在選取時加入一條固定文字；修改選項會改變穩定 system 前綴，未修改時可重用，實際快取命中仍由供應商決定。未啟用不增加本功能 Token；不新增呼叫或設定字數下限。不同 tokenizer 與生成內容會影響實際帳單，沒有使用付費 API 量測。
- 實際執行數量、最終 SHA 與失敗／待驗證項目，以本輪驗收回報和對應 GitHub Actions 為準，不將配置了 CI 視為已通過。
