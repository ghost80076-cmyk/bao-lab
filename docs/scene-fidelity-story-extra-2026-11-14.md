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
