# 夜灣模型池選擇原則（候選草案）

> 狀態：待整理／待逐型號驗證  
> 目的：先把 2026-10-01 討論結論放進 PR，避免直接把未驗證的新模型推進正式模型池。

## 核心原則

夜灣不把「最新模型」等同於「最適合 RP」。

模型是否進入預設池，至少同時看：

1. **價格與價格穩定性**：Input / Output / Cache / 長上下文級距，以及是否有已知促銷或即將調價。
2. **RP 真實採用度**：OpenRouter 等平台的 Roleplay 使用量可以當 adoption 訊號，但不能當品質排行榜。
3. **RP 實際表現**：角色一致性、文風、長聊穩定性、重複、OOC、替玩家做決定、拒答／政策牆等。
4. **版本成熟度**：舊模型如果供應穩定、價格合理、玩家仍喜歡，可以繼續保留。
5. **夜灣自身數據**：未來優先觀察重抽率、平均每輪成本、平均對話長度、換模型率與玩家實際留存。

## 模型選單的產品定位

夜灣提供「模型選擇庫」，不是單一排行榜。

不要用「S 級／最強／最佳 RP」這類絕對標籤；改用能讓玩家自己取捨的資訊：

- 價格
- 速度
- Context
- RP 社群使用度
- 文風傾向
- 角色一致性
- 政策／拒答傾向
- 資料成熟度
- 新版／成熟／觀察中

核心文案方向：

> 沒有最好的模型，只有更適合這段故事的模型。

## 家族方向（不是排名）

### 低成本模型

DeepSeek、GLM、MiMo、Qwen 等維持低成本與長聊選項。

用途可以偏向：

- 高頻長聊
- 世界模擬
- 記憶摘要
- NPC／事件／狀態整理

便宜本身就是一種合理選擇，不需要與高價模型硬比。

### Gemini

主要保留「敘事／文風／沉浸」取向的選擇，但不同版本必須分開看。

目前方向：

- 保留價格與供應相對穩定、已經有 RP 使用資料的版本。
- Gemini 3.1 系列繼續作為主要觀察／主力候選。
- Gemini 3.8 暫不進主要預設池：
  - 價格存在已知波動／階段性定價問題。
  - RP 風格與穩定性還需要更多資料。
  - BYOK 玩家仍可自行填 Model ID 使用。
- 不因新版出現就自動淘汰舊版。

### Claude

Claude 價格跨度較大，因此值得給玩家更多選項。

需要把以下取捨攤開：

- 邏輯／角色一致性
- 文風
- 政策牆／拒答傾向
- 扮演智能
- 價格

目前方向：

- Haiku：低成本候選，不先標成推薦 RP。
- Sonnet 4.5 / 4.6：成熟版本，保留給喜歡既有 RP 文風的玩家。
- Sonnet 5：列為新版本候選；如果驗證後價格仍低於 4.5 / 4.6，可以上架讓玩家自行比較，但不宣稱一定更適合 RP。
- Opus：高成本候選，可提供給願意付費追求高階表現的玩家，不必拿來做狀態整理。

### GPT / Grok

不要因為目前夜灣主要池裡較少就直接大量加入。

先作候選：

- 驗證 OpenRouter 供應與價格穩定性。
- 找 RP 使用量與實測資料。
- 確認是否真的補足現有模型池的能力／價位空缺。

## 價格資料與推薦資料必須分離

公開排行榜與即時價格不能直接驅動夜灣正式計費。

建議流程：

```
OpenRouter / 官方公開資料
        ↓
模型研究候選
        ↓
人工驗證 + RP 測試
        ↓
夜灣預設模型池
        ↓
確認價格與安全餘裕
        ↓
Worker MODELS_JSON / Hosted allowlist
```

不要做：

```
今天熱門 / 今天便宜
        ↓
自動上架
        ↓
自動改燈火價格
```

## 工程範圍

### BYOK

如果前端已有 OpenAI-compatible / Anthropic / Gemini 自訂 Model ID：

- 多數新模型不需要改後端。
- 玩家自己承擔 API 費用。
- 夜灣主要工作是預設資料、標籤與說明。

### 夜灣燈火（Hosted）

若模型透過既有 OpenRouter 路由：

- Worker `MODELS_JSON` 加入模型與固定計價。
- AWS backend `OPENROUTER_MODELS` allowlist 加入 Model ID。
- 驗證 price guard、usage 與 billing。
- 通常不需要新增 AWS provider adapter。

### 暫不做

現階段不要為每一家模型額外建立：

- OpenAI 官方 relay
- xAI 官方 relay
- 其他新的 provider-specific AWS adapter

除非未來有足夠理由不用 OpenRouter。

## 明日整理清單

- [ ] 拉目前 OpenRouter Roleplay 7d / 30d 使用資料
- [ ] 核對每個候選模型目前官方與 OpenRouter 價格
- [ ] 標記有促銷、即將調價、Preview、Deprecated / EOL 的型號
- [ ] 整理 Claude 候選：Haiku / Sonnet 4.5 / 4.6 / 5 / Opus
- [ ] 整理 Gemini 候選：3 / 3.1 系列；3.8 保持觀察
- [ ] 整理 GPT / Grok 是否有必要補入
- [ ] 定義前端標籤，不做絕對排名
- [ ] 確定正式 hosted 名單後，再改 MODELS_JSON 與 AWS allowlist
- [ ] 最後才決定是否調整夜灣燈火價格

## 本 PR 的界線

這個 PR **只保存模型池決策框架與待辦**。

目前不：

- 改正式 hosted 模型
- 改 Worker 計費
- 改 AWS allowlist
- 改玩家現有模型選擇
- 部署任何新模型

等候下一輪資料整理後，再拆成小 PR 實作。


## 2026-10-01 第一輪市場快照

> 這一段是候選資料快照，不等於夜灣推薦榜。價格與供應狀態在正式上架前必須再次核對。

### OpenRouter RP adoption 訊號

OpenRouter 的 Roleplay collection 明確以「最近 7 天 prompt + completion tokens」排序，代表採用度，不代表品質。2026-10-01 的頁面仍由低成本模型主導，DeepSeek、MiMo、GLM 等佔明顯位置；這支持夜灣保留低成本長聊區，但不能直接把榜單當成品質排名。

來源：
- https://openrouter.ai/collections/roleplay/

### 第一輪候選表

| 模型 | 目前公開價（Input / Output，USD / 1M） | Context | 第一輪處理 |
| --- | ---: | ---: | --- |
| DeepSeek V4.1 Flash（OpenRouter） | 約 $0.01554 / $0.396 | 約 1.05M | **低成本主力候選**；RP adoption 很強，後續驗證文風與實際路由價格 |
| GLM 5.3 Flash（OpenRouter） | 約 $0.02 / $0.2475 | 約 1.05M | **低成本主力候選** |
| MiMo V2.6 Flash（OpenRouter） | 約 $0.07 / $0.28 | 約 1.05M | **候選**；先和既有 MiMo V2.5 比，不因新版直接取代 |
| Gemini 3 Flash Preview | $0.50 / $3 | 1M | **保留**；價格清楚、已有較多使用歷史 |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | 1M | **低成本／輔助候選** |
| Gemini 3.1 Pro Preview | $2 / $12（<200K）；$4 / $18（>200K） | 1M | **高品質候選**；長上下文有明確價格級距 |
| Gemini 3.8 Flash | $0.75 / $3.75（至 2026-12-31）；2027-01-01 起 $1.50 / $7.50 | 1M | **觀察／BYOK**；雖已 GA，但已知價格會翻倍，不先進夜灣預設 Hosted |
| Claude Haiku 4.5 | $1 / $5 | 200K | **備選**；低價 Claude，但需實測 RP 拒答與角色深度 |
| Claude Sonnet 4.5 | $3 / $15 | 1M | **保留成熟候選**；給偏好舊版 RP 文風的玩家 |
| Claude Sonnet 4.6 | $3 / $15 | 1M | **保留成熟候選** |
| Claude Sonnet 5 | $2 / $10 | 1M | **強候選**；官方已把原先 introductory price 改為永久標準價，值得讓玩家自行和 4.5 / 4.6 比較 |
| Claude Opus 4.6 | $5 / $25 | 1M | **豪華備選**；不作日常預設，也不拿來做狀態整理 |
| Claude Sonnet 5.5 | $2 / $10 | 1M | **觀察**；2026-09-28 才發布，價格雖與 Sonnet 5 相同，但 RP 資料太新 |
| GPT-5.6 Luna（OpenRouter standard） | $0.20 / $1.20 | 約 1.05M | **備選候選**；價格低，且已出現在 OpenRouter RP collection，值得補足非中國低成本選項 |
| Grok 4.7 | $1.60 / $4.80 | 500K | **觀察候選**；2026-09-21 才發布，價格有吸引力，但 RP 歷史太短 |

### 目前傾向

第一輪先不要追求「每一家都有最新型號」，而是形成幾個價位與風格區：

- **超省長聊**：DeepSeek / GLM / MiMo / Qwen
- **敘事與文風**：Gemini 3 / 3.1 系列
- **Claude 多代選擇**：Haiku 4.5 / Sonnet 4.5 / 4.6 / 5 / Opus 4.6
- **非中國低成本補位**：GPT-5.6 Luna
- **新模型觀察**：Grok 4.7、Claude Sonnet 5.5、Gemini 3.8 Flash

這仍然不是最終上架名單。下一輪應該補「RP 實測／政策牆／拒答／重抽成本」後再決定 Hosted。

### 本輪來源

- OpenRouter Roleplay: https://openrouter.ai/collections/roleplay/
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Claude Sonnet 5: https://www.anthropic.com/research/claude-sonnet-5
- Google Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini 3.8 Flash: https://ai.google.dev/gemini-api/docs/latest-model
- GPT-5.6 Luna: https://openrouter.ai/openai/gpt-5.6-luna
- Grok 4.7: https://openrouter.ai/x-ai/grok-4.7
