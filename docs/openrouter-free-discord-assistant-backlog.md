# OpenRouter Free 額度用途規劃：Discord 吉祥物 AI 助理

> 優先級：低 / Backlog
>
> 這份文件只記錄方向，不代表近期要投入開發，也不應阻塞目前模型池、記憶、狀態、同步與核心體驗工作。

## 背景

OpenRouter 的 `openrouter/free` 有每日免費請求額度。若直接把這批額度當成玩家 RP 商品，收益有限，且會增加「為什麼今天不能用」「免費模型為什麼失效」等客服成本。

因此較適合把免費額度視為官方營運資源，優先考慮用於 Discord 吉祥物／客服助理，而不是一般玩家主聊天模型。

## 目標

讓 BAO / YoruBay 吉祥物在 Discord 成為第一線 AI 助理，處理低風險、重複性高的問題，降低人工客服負擔。

可能支援：

- 新手使用教學
- API / YoruBay 點數設定說明
- 模型用途說明
- 記憶、狀態欄、故事庫、角色卡創作室教學
- 常見 HTTP 400 / 403 / 429 / 503 問題的初步判斷
- 引導玩家提供診斷編號、裝置、模型、重現步驟
- 把玩家的長篇 Bug 敘述整理成固定格式，方便管理員查看
- 官方 FAQ / 說明文件查詢

## 不適合交給 Free Router 的工作

因為 `openrouter/free` 可能由不同免費模型處理，品質與可用性會變動，因此不應負責：

- 正式 RP 主聊天
- 最終長期記憶寫入
- 關鍵世界狀態覆寫
- 需要高度一致 JSON schema 的核心資料更新
- 金流、帳務、封禁等需要權威決策的管理操作
- 自動執行會改變玩家資料或帳號狀態的動作

吉祥物應以「說明、整理、引導」為主，不具有管理員權限。

## 建議架構

```text
Discord 玩家
    |
    | @包包 / /ask
    v
Discord Bot
    |
    +-- 固定 FAQ 命中 ------> 直接回覆，不消耗 LLM request
    |
    +-- 需要理解語意 -------> OpenRouter Free
                              |
                              +-- 固定 system prompt
                              +-- BAO/LAB FAQ / 文件知識
                              +-- 回答限制與客服規則
```

不要讓人格完全依賴實際被 OpenRouter 分配到的免費模型；角色設定、語氣、限制與官方知識應由自己的 prompt / knowledge layer 固定。

## 額度保護

未來實作時至少應有：

- 單一 Discord 使用者 cooldown
- 每人每日 AI 問答上限
- 全站每日安全上限，保留一部分 buffer，不吃滿上游 quota
- RPM 節流
- 免費路由不可用時退回固定 FAQ / 教學，不應讓 Bot 整體失效
- 清楚區分 AI 建議與官方管理員決策

## 建議回報格式

玩家描述 Bug 後，吉祥物可以整理成：

```text
裝置：
瀏覽器：
功能：
模型：
症狀：
是否可重現：
最近一次正常時間：
診斷編號：
玩家補充：
```

整理結果可讓玩家自行貼到指定問題回報頻道；第一版不需要 Bot 自動開 issue 或修改 GitHub。

## 與 YoruBay Wallet 的關係

此 Backlog 不改變目前 Wallet 計費。

- 玩家正式 Hosted 模型仍依各自上游成本與 Wallet 規則處理。
- `openrouter/free` 是否繼續出現在玩家模型池，應與 Discord 吉祥物用途分開決策。
- 不因本規劃自動新增「每次 1 點」或任何最低平台費。
- 若未來真的要對 Free Router 收平台費，應另開 billing PR，避免與 Discord 助理混在一起。

## 建議優先級

此功能放在低優先級 Backlog。

在開始實作前，至少先完成／穩定：

1. YoruBay Hosted 模型池與 OpenRouter / AWS / Worker allowlist 同步
2. 記憶與狀態系統穩定度
3. 玩家實際付費流程與 Wallet 計費驗證
4. 手機 / PC 核心故事體驗
5. 目前高優先級 Bug 與部署驗收

## 未來實作拆分

若日後啟動，可拆成數個獨立 PR：

- Discord Bot 最小骨架與 /ask
- FAQ / 文件知識來源
- OpenRouter Free 路由與 quota guard
- 吉祥物 system prompt / persona
- Bug 回報整理器
- 管理員觀測：每日 request 使用量、429、fallback 次數

目前只保留規劃，不進入實作。
