# GitHub Traffic 每日存證（夜灣）

此機制將 GitHub **Traffic API 的原始數據** 與 **Actions workflow-run 計數** 對齊，作為後續調查依據；它**不會識別 Clone 操作者**，也**不能直接計算外部 Clone 數量**。

## 啟用步驟

1. 在來源 Repository 的 **Settings → Secrets and variables → Actions → Secrets**，建立 `TRAFFIC_READ_TOKEN`。建議建立 **Fine-grained personal access token**，Repository access 只選 `ghost80076-cmyk/bao-lab`，Repository permissions 設定 **Administration: Read-only**，其餘維持預設最低權限。不要把 token 寫進程式或討論串。
2. 合併 PR 後，在 **Actions → GitHub Traffic Evidence → Run workflow** 手動執行一次驗證。
3. 設定完成後，每天 **UTC 09:17（台灣時間 17:17）** 排程執行。排程可能延遲，並非保證準時。
4. 在該 Actions run 的 Summary 查看對照表，在 Artifacts 下載完整 JSON。**Artifact 預設保留 90 天（仍受 Repository 設定限制），不是永久存證。**

如果沒有 `TRAFFIC_READ_TOKEN`，擷取步驟會明確失敗，不會記錄「0 clones」冒充正常數據。

## 可選：永久存入私人 Repository

建議新建一個 **Private** Repository（例如 `ghost80076-cmyk/yorubay-traffic-evidence`），然後在夜灣來源 Repo 的 **Settings → Secrets and variables → Actions**：

- **Variable** `TRAFFIC_ARCHIVE_REPO`：填入 `owner/private-repo`
- **Secret** `TRAFFIC_ARCHIVE_TOKEN`：選取該私人 Repo 的 Fine-grained PAT，至少具有 **Contents: Read and write**；不需管理其他 Repo 的權限。

每次執行會將 JSON 作為 **獨立快照** 寫入 `traffic-snapshots/YYYY-MM-DD/`。不覆寫既有同名快照；Git 歷史保留後續比對依據。程式會檢查目的地是否真正為私人 Repository，**若是 Public 會拒絕上傳**。

與 Traffic 讀取權杖分開設定，避免一支 PAT 同時取得來源專案管理權限與私人資料庫寫入權限。**請勿把私人 Repo 設為 Public。**

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

此流程只讀來源 Repo 的 Traffic/Actions，不會修改夜灣程式、玩家記憶、資料庫或部署環境。
