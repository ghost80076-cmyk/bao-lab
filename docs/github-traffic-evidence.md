# GitHub Traffic 每日存證（夜灣）

此機制將 GitHub **Traffic API 的原始數據** 與 **Actions workflow-run 計數** 對齊，作為後續調查依據；它**不會識別 Clone 操作者**，也**不能直接計算外部 Clone 數量**。

## 啟用步驟

1. 在來源 Repo 的 **Settings → Secrets and variables → Actions → Secrets**，新增 `TRAFFIC_READ_TOKEN`：Fine-grained PAT，僅選 `ghost80076-cmyk/bao-lab`，設定 **Administration: Read-only**，其他權限保持最低。
2. **必須**建立另一個 **Private Repository**（如 `ghost80076-cmyk/yorubay-traffic-evidence`），建立時勾選 **Add a README** 以初始化預設分支。請勿把存證資料放在 Public Repo。
3. 在來源 Repo Actions 新增 **Variable** `TRAFFIC_ARCHIVE_REPO` = `owner/private-repo`；新增 **Secret** `TRAFFIC_ARCHIVE_TOKEN`（Fine-grained PAT，僅給該私人 Repo 的 **Contents: Read and write**）。
4. 合併 PR 後，在 **Actions → GitHub Traffic Evidence → Run workflow** 手動執行。此後每天 **UTC 09:17（台灣時間 17:17）** 排程擷取；排程可能延遲。
5. 在私人目的地 Repo 的 `traffic-snapshots/YYYY-MM-DD/` 查看原始 JSON 與 Markdown 摘要。每次 Run/Attempt 各有獨立快照；相同檔名不會覆寫。

缺少任何一個憑證或私人 Repo 設定都會**明確失敗**。程式會先確認目的地為 Private，否則拒絕上傳。不會寫入假的零值。

**安全設計：** Public Repository 的 Actions Logs、Summary、Artifacts 也可能被外界讀取，因此本流程**不會在其中輸出 Clone 數字、逐日數據或 JSON**。GitHub Actions Summary 僅提供泛用成功訊息；完整內容只在你指定的私人 Repo。

來源 Repo 的 Traffic 讀取權杖與私人目的地寫入權杖分開，避免權限交叉。前者不需要寫入程式碼；後者不需要來源 Repo 的 Administration 權限。

## 資料定義與判讀限制

- Traffic 的 `count`、`uniques` 以及逐日數列均由 GitHub 官方 REST API 取得。每日日期為 **UTC**，有效視窗只有最近 **14 天**；過期日期無法補抓。
- `rolling_14d_uniques` 是跨日期去重值，**不可用逐日 uniques 相加取代**。Unique cloner 也不等於可辨識的自然人。
- `action_workflow_runs` 是該 UTC 日啟動的 Actions Workflow 次數，**不是 Job 數，也不是 checkout 數**。一個 Workflow 可能含多個 Job、多次 `actions/checkout`。部分 CI 也可能不使用 checkout。
- 每次本工作流程自身的 Checkout 也可能計入 GitHub Traffic。
- 兩條曲線相似只能支持「與自動化有關」的假說；**不能直接用 Clone − Actions 得到真人下載數，也不能把未解釋流量歸因於競品。**
- GitHub 說明：REST API [Traffic](https://docs.github.com/en/rest/metrics/traffic)；[Viewing repository traffic](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)。

## 驗證

```bash
python3 -m unittest discover -s tests -p 'test_github_traffic_evidence.py' -v
```

此流程只讀來源 Repo 的 Traffic/Actions，不會修改夜灣程式、玩家記憶、資料庫或部署環境；僅向你設定的私人 Repository 寫入快照。
