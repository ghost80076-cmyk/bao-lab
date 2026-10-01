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


## 2026-10-01 第二輪：RP 實測／社群口碑

> 這一層補的是「實際拿來扮演會發生什麼」，不是再比一次規格。  
> 社群回報高度受 preset、provider、量化、外部 moderation 與路由影響，因此只把多個訊號重複出現的現象寫成產品提示；不把單一 Reddit 回報當成模型定論。

### 參考方式

目前交叉使用兩類資料：

1. **可重現 RP benchmark**：看多輪角色一致性、context attention、instruction drift、agency respect、拒答／過度拒答等。
2. **SillyTavern / RP 社群實際使用回報**：補足文風、對話自然度、重抽、provider 差異、長聊體感。

其中 rp-benchmark 自己也提醒：寫作品質、failure mode、community engagement 與 willingness 是不同軸，不能壓成一個「總分」。

來源：
- https://github.com/LeviTheWeasel/rp-benchmark
- https://www.reddit.com/r/SillyTavernAI/

### Claude

#### Haiku 4.5

社群常見優點：

- 對話自然、訊息結構好讀。
- 細節記憶與人物個性表現有人給正面評價。
- 相對 Sonnet / Opus 便宜。

常見疑慮：

- subtext / 細膩度通常被認為弱於 Sonnet。
- 有玩家回報暗黑／成人 RP 比 Sonnet 更容易拒答。
- 有人認為「便宜 Claude」的價格仍不一定能打贏中國低成本模型的 CP 值。

**夜灣暫定：備選。**  
可以提供給想要 Claude 風格但預算較低的玩家，不標「推薦 RP」。

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1p8nlx2/huge_list_of_recent_favorite_models_for_rp/
- https://www.reddit.com/r/SillyTavernAI/comments/1o7gzgm/claude_haiku_45/

#### Sonnet 4.5

目前資料相對成熟。

rp-benchmark 的多輪 failure-mode 資料裡，Sonnet 4.5 對：

- 長 session / 詳細角色卡的 context attention 表現突出。
- agency respect 與 instruction drift 也在前段。

社群仍有人偏好它的舊版文風與對話記憶。

**夜灣暫定：成熟候選，保留。**

#### Sonnet 4.6

benchmark 的 NSFW craft 與多輪品質仍在高段，但 willingness 測試與社群回報顯示它不是「完全沒有政策牆」。

**夜灣暫定：成熟候選，保留。**  
與 4.5 並存，不用強迫升級。

#### Sonnet 5

第一批社群回報偏正面：有人認為品質／一致性明顯高於舊 Sonnet，而且價格比 4.5 / 4.6 低；但也有回報：

- prompt following 風格和舊版不同。
- 有時更容易寫成華麗／purple prose。
- NSFW / RP willingness 仍有版本差異。

rp-benchmark 的 willingness 軸顯示 Sonnet 5 對真正硬限制能守住，但「過度拒答」仍有一定比例；因此不能因為價格低就直接把它當 4.6 的全面替代。

**夜灣暫定：強候選。**  
適合上架讓玩家自行和 4.5 / 4.6 比較，但不取代舊版。

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1ujwo47/sonnet_5_is_out/
- https://github.com/LeviTheWeasel/rp-benchmark

#### Opus 4.6

目前是資料最穩的一批高階 RP 候選之一。

benchmark 在多輪 failure mode、POV、lore contradiction、agency respect 等都有很強表現；社群也常把它當複雜劇情／重要場景的高品質選擇。

最大問題非常明確：**價格。**  
而且重抽一次的成本也明顯比低價模型痛。

**夜灣暫定：豪華備選。**  
提供選擇，但不鼓勵當摘要／狀態模型。

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1sdw1nf/using_claude_opus_46_was_a_mistake_for_my_wallet/
- https://github.com/LeviTheWeasel/rp-benchmark

### Gemini

#### Gemini 3.1 Pro

RP 社群評價不是完全一致，但「喜歡它的人非常喜歡」：

常見正面：

- 長篇敘事、文風、角色互動有強烈支持者。
- 有玩家會把 Gemini 當日常主力，只在更複雜場景切 Opus。

常見負面：

- 有玩家覺得和 Gemini 3.0 相比，3.1 人物較扁、世界感與主動推進下降。
- 外部 content filter / provider moderation 可能造成空回覆，容易被誤認成模型本身拒答。

rp-benchmark 的多輪結果仍把 3.1 Pro 放在可用的高品質群，但不是每個 failure mode 都突出。

**夜灣暫定：保留。**  
它存在的理由不是「最新」，而是明確提供 Gemini 敘事／文風取向。

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1vqshjg/whats_the_best_for_roleplaying_right_now_i_dont/
- https://www.reddit.com/r/SillyTavernAI/comments/1sorfrw/why_is_gemini_31_pro_so_meh/
- https://www.reddit.com/r/SillyTavernAI/comments/1scy6uz/has_gemini_31_pro_increased_its_censorship/
- https://github.com/LeviTheWeasel/rp-benchmark

#### Gemini 3.8 Flash

最新 RP 社群確實有人很喜歡，甚至把它當主力；因此「RP 一定不行」不能成立。

但夜灣不只考慮品質：

- 目前已知價格會在 2027-01-01 明顯調高。
- 模型仍新，長期 RP 行為資料不夠成熟。

**夜灣暫定仍維持：觀察／BYOK。**  
品質口碑變好不改變價格穩定性的產品風險。

### DeepSeek

#### V4 Pro / V4 Flash

benchmark 對 V4 Pro 的多輪表現很強，V4 Flash 也有不差的品質訊號；官方甚至提供 RP thinking / CoT 控制方式，代表它本身有針對 RP 使用情境做過設計。

但社群的長聊體感相當分裂：

- 有人認為角色定義、對話與 prose 很強。
- 也有人回報 instruction drift、忘記格式、主動性下降、長聊後變乾。
- provider / thinking mode 對體感差異很大。

**夜灣暫定：低成本主力仍保留，但不要寫成「穩定勝過高價模型」。**

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1su8x8p/deepseek_v4_rp_guide_how_to_switch_between/
- https://www.reddit.com/r/SillyTavernAI/comments/1sv1anm/deepseek_v4_is_great/
- https://www.reddit.com/r/SillyTavernAI/comments/1uua4cs/deepseek_v4_is_the_worst_model_ever_to_roleplay/
- https://github.com/LeviTheWeasel/rp-benchmark

### GLM

#### GLM 5.3 / 5.3 Flash

這一代很能說明「新版不一定適合直接取代舊版」。

正面回報：

- NPC 對話與主動性比前代改善。
- Flash 的 prose / 創意以價格來說有人很滿意。

反覆出現的問題：

- thinking 很慢、消耗大量 token。
- safety reasoning / policy thinking 可能侵入正常 RP。
- 有玩家覺得角色只看眼前文字，對先前 backstory / build-up 的利用變淺。
- provider 差異很大。

因此 **GLM 5.2 / 4.7 這些舊版仍值得一起比較，不能看到 5.3 就自動淘汰。**

**夜灣暫定：5.3 Flash 可留候選，但先不把它定成 GLM 唯一主力。**

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1vumkk9/glm_53_kinda_sucks_for_roleplay/
- https://www.reddit.com/r/SillyTavernAI/comments/1w0nh19/glm_53_vs_glm_53_flash/
- https://www.reddit.com/r/SillyTavernAI/comments/1w1eo9k/glm_53_for_roleplay_with_or_without_thinking/
- https://www.reddit.com/r/SillyTavernAI/comments/1ui1q23/i_hope_glm_stays_on_this_path/

### MiMo

#### MiMo 2.5 / 2.6

2.5 Pro 在 RP benchmark 與社群都有不錯資料；2.6 剛發布時也有正面回報，常提到 scene flow 與較少重複。

但最近也出現：

- provider 間品質差異。
- instruction / spatial consistency 失誤。
- sloppiness / TPS 下降的回報。

**夜灣暫定：2.5 不因 2.6 出現而淘汰；2.6 放候選／觀察。**

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1wmp2qc/mimo_26_pro_is_out_anyone_else_trying_it_for_rp/
- https://www.reddit.com/r/SillyTavernAI/comments/1wty9fa/did_mimo_26_pro_fall_off/
- https://github.com/LeviTheWeasel/rp-benchmark

### Qwen

#### Qwen 3.7 Flash

價格很漂亮，但目前 RP 證據不夠強。

社群常見看法是：

- instruction following 有潛力。
- Flash 型號非常便宜。
- 但主要訓練／產品取向並不是 RP，長篇扮演品質未形成穩定口碑。

**夜灣暫定：更適合摘要／狀態／輔助模型候選，不急著當主 RP 模型。**

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1vn9c4u/anyone_tried_qwen_37_flash_for_roleplay/

### MiniMax M3

社群評價偏混合：

- 有人認為回覆速度與品質都不錯。
- 有人仍更偏好 MiMo / GLM。
- 有 loop、對 prompt / preset 敏感等回報。

它目前仍有 RP 使用者與專用 preset，因此沒有必要移除，但也不需要抬成「高品質代表」。

**夜灣暫定：保留平價／中價備選。**

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1tun983/anyone_tried_minimax_m3_for_rp_yet/
- https://www.reddit.com/r/SillyTavernAI/comments/1uy5ffi/minimax_m3_roleplay_prompt/

### GPT

#### GPT-5.6 Luna

目前找得到的 RP 社群訊號偏弱，甚至有一些明確負評：

- 容易冗長。
- 有玩家回報人物會變成「moral supervisor」式說教。
- 新 OpenAI 系列被不少 RP 玩家視為更偏知識／工作用途，而不是 RP 優化。

目前證據不足以支持「因為便宜就一定要放正式 Hosted」。

**夜灣暫定：BYOK／觀察，不急著補 Hosted。**

參考：
- https://www.reddit.com/r/SillyTavernAI/comments/1urzvq1/gpt_56_released/

### Grok

#### Grok 4.7

4.7 太新，而且目前 RP 社群對 Grok 的主要懷念反而集中在 4.1 / 4.2 時期。

最近回報常見：

- 更新後 RP / companion 體感下降。
- moderation / censorship 比舊版更明顯的案例。
- 也有人覺得 character RP 還可以，但共識不足。

rp-benchmark 已納入 4.7 的 willingness 資料，但那只能回答「哪些內容會／不會拒答」，不能證明它的文風與長篇 RP 已成熟。

**夜灣暫定：觀察，不急著 Hosted。**

參考：
- https://www.reddit.com/r/grok/comments/1wkzsdj/fanfic_writersroleplayers_do_you_think_47_will/
- https://www.reddit.com/r/GrokAiDiscussion/comments/1wnd6w8/grok_47_is_officially_more_cnsored_than_claude/
- https://github.com/LeviTheWeasel/rp-benchmark

## 第二輪之後的候選輪廓

目前先不要把它叫「排名」，比較適合夜灣的是：

| 類型 | 目前較有理由保留／研究 |
| --- | --- |
| 超省長聊 | DeepSeek V4 Flash、MiMo 2.5、GLM 舊版／5.3 Flash 併行比較 |
| 輔助摘要／狀態 | Qwen 3.7 Flash、Gemini 3.1 Flash-Lite |
| 敘事／文風 | Gemini 3.1 Pro |
| Claude 平價 | Haiku 4.5（備選） |
| Claude 成熟 RP | Sonnet 4.5、Sonnet 4.6 |
| Claude 新價格甜蜜點 | Sonnet 5（強候選，但不取代舊版） |
| 豪華場景 | Opus 4.6 |
| 先觀察 | Gemini 3.8、MiMo 2.6、GPT-5.6 Luna、Grok 4.7、新 Claude |

### 目前最值得下一步驗證的不是更多新模型

第三輪應該只做兩件事：

1. **把目前夜灣已上架的 Hosted 模型和這份候選表對齊。**
2. **挑少量真正可能新增的模型做固定角色卡 A/B。**

第一批 A/B 可以先測：

- Claude Sonnet 4.5
- Claude Sonnet 4.6
- Claude Sonnet 5
- Gemini 3.1 Pro
- DeepSeek V4 Flash
- MiMo 2.5

同一張角色卡、同一段歷史、同一批 20–30 個劇情節點，記：

- 是否搶玩家控制權
- 是否 OOC
- 是否漏 lore
- 是否拒答
- 是否重複
- 是否需要重抽
- 每輪實際 Token / 成本

這樣第三輪才會開始產生「夜灣自己的 RP 數據」，而不是永遠只抄外部社群。


## 2026-10-01 第三輪：現有 Hosted 對照與缺口

### 目前 main 的正式 Hosted 模型

目前模型 registry 共有 9 個 Hosted 選項：

| 類型 | 模型 | 目前路由 |
| --- | --- | --- |
| 超省長聊 | DeepSeek V4 Flash 0731 | OpenRouter |
| 超省備選 | Qwen 3.7 Flash | OpenRouter |
| 超省備選 | MiMo V2.5 | OpenRouter |
| 日常主力 | Gemini 3 Flash | Google 官方 |
| 長篇世界 | MiniMax M3 | OpenRouter |
| 高品質 | Gemini 3.1 Pro | Google 官方 |
| RP 高品質 | Claude Sonnet 4.5 | OpenRouter |
| RP 高品質 | Claude Sonnet 4.6 | OpenRouter |
| 豪華 | Claude Opus 4.6 | OpenRouter |

另外 BYOK 已經有：

- OpenRouter Free
- Gemini 2.5 Flash 相容備選
- Claude Opus 4.5
- Z.AI / GLM 自訂 Model ID
- OpenAI 官方自訂 Model ID
- 自訂 OpenAI-compatible / Anthropic-compatible / Gemini-compatible

### 和候選研究比對後的真正缺口

目前不是「模型太少」，而是 **Claude 價格梯度中間少了兩格**。

Claude 現在 Hosted 是：

```
Sonnet 4.5  →  Sonnet 4.6  →  Opus 4.6
```

但按照目前研究，比較合理的選擇帶應該是：

```
Haiku 4.5
   ↓
Sonnet 5
   ↓
Sonnet 4.5 / 4.6
   ↓
Opus 4.6
```

這樣玩家才是真的在選：

- 想要 Claude 但預算低一些
- 想試新版／價格甜蜜點
- 想保留成熟舊版 RP 文風
- 願意付高價追求 Opus

### 第一批真正值得新增

#### 1. Claude Sonnet 5 — 高優先

**理由：**

- 補上目前 Claude 模型池最明顯的價格／世代缺口。
- 不需要移除 4.5 / 4.6。
- 適合用「新版備選」定位，讓玩家自己比較。
- 可沿用 OpenRouter Hosted 路由，不需要新增新的 AWS provider adapter。

**建議標籤：**

> Claude Sonnet 5 · 新版備選

不要寫：

> 最強 Claude / 取代 4.6 / 最佳 RP

#### 2. Claude Haiku 4.5 — 中高優先

**理由：**

- 提供較低成本的 Claude 選擇。
- 與目前「Claude 只有高價 Sonnet / Opus」形成清楚差異。
- RP 表現與政策牆仍有疑慮，因此只作備選。

**建議標籤：**

> Claude Haiku 4.5 · 低成本 Claude

不要標成：

> 省錢主力 / RP 推薦

### 暫時不需要新增 Hosted

#### Gemini 3.8 Flash

維持觀察／BYOK。

原因：

- 已知價格會調整。
- 夜灣目前已有 Gemini 3 Flash + Gemini 3.1 Pro，敘事價位帶並沒有明顯缺口。
- 上 3.8 目前只會增加選單複雜度。

#### Gemini 3.1 Flash-Lite

暫不急著 Hosted。

原因：

- 夜灣已有大量更便宜的 DeepSeek / Qwen / MiMo。
- 如果玩家只是要「省」，現有低成本帶已經夠完整。
- 未來可以考慮作「便宜 Gemini／輔助模型」的 BYOK preset，而不是主 Hosted。

#### GPT-5.6 Luna

先維持 BYOK / 自訂 OpenAI。

原因：

- 目前沒有足夠 RP 證據證明它能補足現有 Hosted 的缺口。
- 單純「非中國、又便宜」還不足以成為 Hosted 理由。

#### Grok 4.7

維持觀察。

原因：

- 太新。
- RP 口碑還不穩定。
- 沒有必要為了品牌完整性硬上。

#### MiMo 2.6

先不取代 2.5。

原因：

- 2.5 已經有成熟使用資料。
- 2.6 的 provider / instruction consistency 回報仍有波動。

#### GLM 5.3 / 5.3 Flash

先不做唯一 Hosted GLM。

原因：

- 夜灣已提供 Z.AI / GLM BYOK 自訂 Model ID。
- 5.3 新版的 RP 回報分裂。
- 如果未來真的要加入 Hosted，應該先比較 5.2 / 5.3 Flash，而不是直接把最新版當答案。

### 現有 Hosted 需要「重新檢討」而不是立刻移除的模型

#### Qwen 3.7 Flash

目前仍有「超省」價值，但更適合被描述為：

- 輔助摘要
- 狀態整理
- 低成本大量聊天

不急著移除，但前端標籤可以避免讓玩家誤以為它是主要 RP 推薦。

#### MiniMax M3

先保留，不在這個 PR 移除。

第三輪 A/B 時把它一起放進「是否還值得保留 Hosted」的檢查，而不是只檢查新模型。

### 第一階段實作建議

**只新增兩個 Hosted 候選：**

1. Claude Sonnet 5
2. Claude Haiku 4.5

其他模型都先不動。

這會把正式 Hosted 從 9 個增加到 11 個，但不是把所有新模型灌進選單。

### 實作拆分

下一個實作 PR 建議保持小範圍：

#### PR B：Claude 選擇帶

- 在 `data/presets/models.json` 加入 Haiku 4.5 / Sonnet 5
- 補 Hosted label / tier / order
- 更新 `tests/model-presets-core.cjs`
- 不改其他模型

#### PR C：Hosted 計費與 AWS allowlist

在 PR B 驗證 UI / registry 沒問題後再做：

- Worker `MODELS_JSON` 加入新型號與固定價格
- AWS `OPENROUTER_MODELS` 加入 Model ID
- 驗證 price guard / usage / billing
- 再開給測試玩家

### 結論

目前沒有理由大改整個模型池。

真正的缺口不是 GPT、Grok 或 Gemini 3.8，而是：

> **Claude 目前只有中高價與豪華，缺少低價 Claude 與新版價格甜蜜點。**

所以先補：

> **Haiku 4.5 + Sonnet 5**

其餘維持現狀，等夜灣自己的 A/B 數據再決定。
