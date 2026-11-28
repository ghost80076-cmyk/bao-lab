# 語意記憶召回 P0：研究基線與決策門檻

基準 main：`710cbdba4879a459c8fe633bd4ab22bba7de124b`。本階段只提交研究文件及合成 oracle，不修改 runtime、Prompt、預設設定、模型路由、存檔、部署或玩家費用。

## 現況與缺口

`js/episodic-memory-core.js` 先驗證原文與目前角色共同知情，依公開事實／實際可見 claim 生成候選，再使用中文雙字片段、關鍵詞、關係提示和有限信任規則。詞彙分數為零的候選在 `if (!score)` 被排除，選用 hybrid 的全文排序也不能找回它。現有 4 筆／2,400 字元限制、來源與動態 user 區塊不變。章節召回獨立選用且有額外 450 粗估 Token 上限。本研究先限定事件召回，不同時改章節、Canon、世界書、Phone、語音或圖片。

參考 `docs/recall-acceptance.md`、`docs/memory-request-contract.md`、`docs/audits/p3-scene-memory-hybrid-recall-2026-11-03.md`。既有 v3 開發集 52/53、保留集 7/8 是小型合成報告，不代表實際玩家品質；本輪未重跑，亦未量測任何 embedding。

## 開源參考與候選

- [Mem0 OSS](https://github.com/mem0ai/mem0/blob/main/docs/open-source/overview.mdx)：借鑑可交換 embedder、混合搜尋與 metadata filters；不引入其記憶提取、向量服務或改寫流程。
- [Transformers.js](https://huggingface.co/docs/transformers.js/index)：候選瀏覽器端 ONNX 推論；WASM 與 WebGPU 分開量測，不假設每個裝置都支援。
- [Xenova multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small)、[上游模型卡](https://huggingface.co/intfloat/multilingual-e5-small)：第一個候選，評估繁中／英文與混合語句，依模型卡採 query/passage 前綴（實際為 `query: `／`passage: `）、mean pooling、L2 normalization。正式採用前固定模型及 runtime revision、核對授權、檔案大小和 tokenizer 截斷；本 PR 不下載模型。
- BYOK embedding 及自架 Ollama 可作後續進階選項；必須另取得明確同意，揭露傳輸內容、目的地與計費。P0/P1 不發出外部玩家文本請求。

## P0 固定研究集

新增 `tests/fixtures/recall-acceptance/semantic-research-v1.json`，15 個合成查詢，含逐字控制、兩個人工指定的語意改寫診斷、無關查詢、角色獨知／混合知情、原文改寫／刪除、較晚更正與回溯、關閉及 full 模式。使用原有 evaluator，不另建一套記憶引擎。

```sh
node scripts/evaluate-episodic-recall.cjs --fixture tests/fixtures/recall-acceptance/semantic-research-v1.json --report /tmp/semantic-research-baseline.json
node scripts/evaluate-episodic-recall.cjs --report /tmp/recall-v3.json
node scripts/evaluate-episodic-recall.cjs --fixture tests/fixtures/recall-acceptance/trust-heldout.json --report /tmp/recall-heldout.json
```

新 fixture 的 knownMissing 是依原始碼提出的待驗證基線，不是已執行結果。不得調整 oracle 來掩蓋錯召回；若實際基線不同，記錄原因。改寫案例以外另建立事前封存的多故事保留集（至少涵蓋繁中隱喻、否定、角色方向、跨語言、近義干擾、短查詢、無匹配）；不得用本研究集調參後宣稱泛化。

## P1 離線實驗（尚未實作）

只用人工合成資料，在開發環境對比既有詞彙、現有 hybrid 與向量候選。對同一 query、角色、分支、來源及輸出預算量測 precision/recall、exact match、錯來源／禁用資訊、額外字元與實際可序列化輸入。另記錄冷啟動下載位元組、暖啟動、p50/p95 查詢與索引耗時、RAM/裝置、瀏覽器及 WASM/WebGPU 失敗；無實測即標示未知。不得從合成 token 或位元組估算帳單。

語意候選必須在現有 evidence、撤回／更正、audience、可見 claim、排除重複之後、詞彙零分丟棄之前取得。只能對當前授權可見 claim 建立向量，不用私密客觀正文、隱藏標籤、未知角色資料或其他故事資料排名。原有權限判斷與輸出序列化仍具最後決定權；不得將索引或向量作為事實來源。

以 exact cosine 作小規模基準，不預先新增向量 DB。先以開發集校準絕對相似度拒絕門檻，再封存設定於獨立保留集驗證；RRF 只融合已達各自相關門檻的候選，避免所有最近鄰必然召回。候選不足或模型錯誤直接退回原有詞彙結果，不阻斷故事。這一階段僅離線評估，不允許注入正式 prompt。

## P2/P3 選用接入門檻（尚未實作）

- 先證明既有及新保留集無新增禁止內容、錯來源、錯角色、分支污染、固定前綴變更或預算超限；既有支援案例不得退步，無關輸入不得新增錯召回。
- 相對既有基線在獨立保留集有可重現的召回改善，再依實測設定可接受裝置資源／延遲門檻。若無明確改善，不接入。
- 預設關閉；不在載入首頁、開啟故事或每輪隱式下載模型，不自動重掃既有歷史，不新增平台付費請求。明確顯示下載量、本機運算與清除索引選項。慢或不支援則回到現有檢索。
- 若需衍生快取，以故事 ID、分支／來源指紋、可見 claim、模型 revision／前處理版本與角色授權範圍隔離；每次取回重驗權限與來源，回溯、修改、刪除、切換故事或模型時使過期結果失效。晚到的非同步結果不得寫入另一故事或進入已取消的請求。向量同樣屬敏感資料，不上傳、不放入公開歷程，不預設同步。先確認存檔與備份契約再設計持久化；索引必須可刪除重建。
- 保持現有動態 user 區塊與固定前綴；不改摘要頻率、權重、記憶提取、Canon、Context Pack、模型費用路由或玩家原文。驗證記憶、分支／回溯、取消生成、存檔、手機效能及 provider usage。只有單獨 PR 通過檢查後才考慮發布。

## 本 PR 交付及限制

研究文件與合成 fixture；無新依賴、模型權重、執行期變更或正式 CI gate 變更。此連線可提交 GitHub 檔案但本機環境不能 clone repository，故尚未執行上述 Node 命令，沒有任何新測試通過聲稱。下一步是先實跑 P0 三組基線，才進入 P1；若現有 CI 未納入此新 fixture，不把綠燈當作其驗收證據。回退本 PR 僅刪除兩個新研究檔案，沒有存檔或部署變動。
