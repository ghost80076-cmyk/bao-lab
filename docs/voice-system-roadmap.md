# 夜灣 YoruBay｜第三階段：角色語音系統總規劃

日期：2026-11-27（台灣時間）
基準：main #986 `5c9edd13626e3722f53f90feca8c025f9cf988e3`
P0 實作：[PR #987](https://github.com/ghost80076-cmyk/bao-lab/pull/987)（已合併；17/17 CI 通過，三瀏覽器 mock 驗收通過；正式部署及真實裝置待驗證）。

本文件是跨 PR 的產品與工程契約。後續每一階段另開實作 PR，引用本文件及前置 PR，以最新 main 為基準；禁止把全部語音功能塞入同一巨型變更。本 PR 只建立規劃及參考索引，不新增依賴或執行程式。

## 1. 產品方向與成本紅線

夜灣是 Local-first、BYOK 的角色扮演／世界模擬，而非單一陪伴聊天產品。語音是獨立選配能力，不強制所有作者或玩家採用。免費基本聲線、進階自訂、玩家自行下載的開源模型、玩家自帶付費 API 分層共存。

- 平台不代付語音、辨識或額外翻譯費用；不新增 GPU 伺服器、不經燈火／AWS／Worker 代理語音；不把大型權重放入 GitHub Pages 或首次載入。
- 模型和語音包由玩家主動下載／匯入；先揭露來源、大小、授權與運算需求。可取消、刪除、釋放記憶體，不無聲下載或切換成付費服務。
- 音訊預設留本機；公開分享及雲端同步不是本期承諾。零平台新增語音推論費用是架構目標，不等於零開發、維護、網頁流量或第三方服務成本。
- RP 文字模型、TTS、STT、音訊理解模型分離；繁中顯示語言、角色配音語言、玩家輸入語言分離。zh-TW/ja-JP/ko-KR/en-US 優先；實際聲線與語言能力依供應商、模型、設備檢查。選語言不等於翻譯；翻譯需經玩家選擇的文字路徑、費用確認及可編輯預覽。

### 2026-11-27 決策對齊：接口優先

夜灣提供語音能力的接入與操作介面，不研發、訓練、預裝或替玩家選定唯一語音模型。基礎使用者沿用裝置 STT/TTS（依裝置及供應商支援）；進階使用者自行下載、申請 API 或架設成熟開源服務，夜灣只提供已驗證的協議 adapter、設定、操作指引及必要安全相容性測試。#993 已關閉不合併，研究分支保留；模型評測不再是接口開發的前置門檻。瀏覽器直接本地推論、模型下載管理均為未來可選擴充，不綁定 STT/TTS 接口交付，也不增加 App 安裝容量。語音錄製／上傳作為故事或 Phone 訊息，與 STT 暫時錄音分開；原生音訊理解依玩家選用 RP 模型能力，不能假裝所有模型都聽得懂。各能力保持小 PR、逐步交付。

## 2. 五個獨立能力

TTS：玩家啟用角色配音後，系統從當前顯示的角色回覆辨識說出口的對白，依作品與角色 ID 套用聲線。角色配音只讀台詞。旁白、動作、內心、玩家發言、系統/OOC、狀態欄與工具資料保持安靜。
STT：語音輸入法，辨識結果填入既有草稿，玩家編輯後按既有送出；不是故事內已開口，不新增世界事件。
Audio Understanding：玩家明確傳送錄音／檔案，只有支援原生音訊的模型及協議才交付音訊；文字替代必須明確切換，不冒稱聽見情緒或背景聲。
Voice Pack：安全、版本化的聲線設定與相容模型／音訊引用。聲線設定包不是可生成任意文字的模型；固定音檔也不是聲音複製。
Voice Call：選配的即時互動介面，最後才整合；不得讓語音繞過既有 story turn、取消、保存、玩家自主權與認知邊界。

## 3. 逐階段工作與驗收

| 階段 | 交付 | 前置與完成門檻 | 狀態 |
| --- | --- | --- | --- |
| P0 | 裝置 TTS/STT，語速、音高、音量，固定角色聲線，手動台詞選擇與辨識草稿 | #987；本地優先、遠端明確同意、三瀏覽器 mock、實體裝置待測 | #987 已合併，17/17 CI 通過；main `26e52ffce9d2f7b10d1f793deee8e798c9321d3b`；production smoke 與實機待驗證 |
| P1a | 玩家聲線工作台及 JSON 裝置聲線設定包匯入匯出 | P0 合併；包格式安全、角色隔離、預覽後保存、往返 | [#989](https://github.com/ghost80076-cmyk/bao-lab/pull/989) 已合併，17/17 PR 工作流程通過，三瀏覽器各 80 項通過。正式站已核對聲線資產，實機聲線待驗證 |
| P1b | 自動辨識角色台詞與說話者 | 既有單角色卡可直接使用。讀取「」中的直接對白，多角色優先使用當前回覆已有的說話者資訊。旁白與內心靜音，說話者不明時略過該句。作者免逐句標註，玩家免逐句確認 | [#992](https://github.com/ghost80076-cmyk/bao-lab/pull/992) 已合併；17/17 PR workflows success，main `6a686342b48b67e3f9d2600e62b01599086bcd82`；HTML 與未知結構略過；正式站及實體裝置驗收待確認 |
| P2 | 選配 STT 接口，沿用既有裝置語音輸入 | P1；玩家自帶 API 或自架相容服務；暫時錄音、明確同意、直接指定端點、可編輯草稿、失敗仍可打字；不綁模型、不下載權重 | [#994](https://github.com/ghost80076-cmyk/bao-lab/pull/994) Draft；首個 OpenAI-compatible /audio/transcriptions adapter 已提交，CI 與實機待驗收；[#993](https://github.com/ghost80076-cmyk/bao-lab/pull/993) 已關閉不合併 |
| P3 | 選配 TTS 接口、授權參考錄音與聲線設計 | P1；沿用台詞及角色聲線契約，玩家自帶 API 或自架成熟開源服務；依實際協議與能力接入，Qwen3-TTS、GPT-SoVITS 為候選，不要求同時接入；CORS/HTTPS/loopback、授權與安全測試 | 待開發 |
| P4 | 玩家錄音／音檔上傳、Phone 私訊／群聊語音訊息、本機音訊資產；選配 AI 角色語音 | 基礎錄音、上傳、播放及保存不依賴 TTS 或音訊理解模型；AI 生成語音需已驗證 adapter；原會話、發送者、成員集合、章節與回覆版本綁定；生成與送達分離；播放、下載、收藏、含音備份與失敗重送；BYOK 逐次確認費用、無自動 retry/fallback | 待開發 |
| P5 | 玩家原生音訊理解 | P4 資產及收件範圍；模型／端點能力查核、音訊 MIME/大小/時間限制、預覽同意、單輪音訊送達、舊音訊不每輪重送，記憶／診斷不帶原始 bytes | 待開發 |
| P6 | 即時語音通話 | P4/P5；先 push-to-talk，停止、打斷、延遲、權限、多人輪替、故事持久化、資料範圍與成本；Pipecat 只做框架研究，不能預設平台新增 server | 待開發 |

P2/P3 可以在 P1 完成後獨立開發，不能將未驗證的服務或開源模型當作已支援。瀏覽器模型研究不再阻擋接口、錄音或 Phone 音訊資產交付。P0 的手動配音不等於完成 P1 自動台詞契約。每個 PR 應更新此表（實際 PR 編號、commit、測試證據、部署狀態與未驗證事項）。

## 4. 架構與契約（提案，待各 PR 實作）

統一 Voice Capability Registry：provider、模型與版本、語言、是否離線、是否支援 style/rate/pitch/voice reference、回應 MIME、成本類別、是否需要授權與下載。每個 adapter 只宣告實際支援欄位，不讓任意作者內容自動啟動 URL 或 API。

P1b 的一般使用流程從玩家開啟角色配音開始。單角色卡在只有主角發話的場景，系統直接把當前回覆中以「」包住的直接對白交給該角色的聲線，按原文順序朗讀。既有卡可沿用原文，不需作者啟用新欄位、修改開場白、標記台詞或要求模型輸出新格式。基本辨識在本機完成，不額外呼叫模型，也不改寫故事 prompt 或存檔。

判讀範例：

| 當前回覆 | 角色配音結果 |
| --- | --- |
| 她放下杯子。「你吃過了嗎？」她把菜單推近了些。「我想點這個。」 | 以她的聲線依序讀「你吃過了嗎？」與「我想點這個。」 |
| 她心想：「他大概還沒吃。」她開口問：「要一起嗎？」 | 只讀「要一起嗎？」 |
| 她看見門上貼著「今日公休」，把傘收了起來。 | 全段安靜 |

單角色卡也可能有其他人插話。多人場景優先沿用已知發話者、角色名或明確的對話歸屬。只有能對應到當前角色的直接對白才使用該聲線，個別句子無法歸屬時略過並繼續其餘台詞。進階作品可選用結構化角色 ID 消除歧義，資料限當前回覆及有效角色。玩家沿用既有的播放、停止、語言與聲線設定；遠端語音仍沿用既有同意流程。

Voice Pack v1 提案：schema/version、engine/model identifier/version、language、voice identifier、參數、授權/來源；選配受限資產清單、sha256、MIME/size。JSON 不允許憑證、任意可執行程式、遠端自動載入、HTML、路徑穿越或不受信任 pickle/pt/pth 自動反序列化。引擎所需模型檔由相容引擎獨立管理，不能承諾通用模型交換。錄音參考與散布必須有權限，避免冒充；不預設真人聲音複製。聲線 ID 在不同設備可能不可用，顯示缺失並重新選擇，不偷偷 fallback。

音訊資產：以圖片系統的明確生成／預覽／保存／送達分離為參考，但獨立音訊儲存契約、容量／時長、真實解碼、去重、事務與備份。不得直接放進既有圖片 MIME allowlist 或故事 prompt、記憶、Context Pack。回溯、分支、回覆變體、刪除、匯入以及多人聊天室的成員集合都需 fail-closed；同一 RP 模型不等於獨立 NPC 沙箱。真實錄音與 STT 的明文結果應清楚分開。

## 5. 開源參考選型（查核 2026-11-27）

以下只是上游參考與候選；未複製任何上游程式碼、權重或聲線，未承諾直接使用。接入前必須記錄固定 tag/commit、模型檔版本、所有相依授權與聲音資料權利，完成瀏覽器可行性測試、供應鏈及安全審查。

| 參考 | 研究內容 | 授權／限制與採用決策 |
| --- | --- | --- |
| [AIRI](https://github.com/moeru-ai/airi) / [LICENSE](https://github.com/moeru-ai/airi/blob/main/LICENSE) | 多供應商 TTS/STT、播放、裝置本地推論與即時陪伴 | 優先研究整合模式，MIT 主專案；不移植整套框架；依賴與模型分開審查 |
| [SillyTavern](https://github.com/SillyTavern/SillyTavern) / [TTS 文件](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/extensions/TTS.md) | 角色聲線 mapping、TTS 文字過濾及 provider UX | AGPL-3.0；僅參考公開功能與行為，不複製程式，除非另做合規審查 |
| [Transformers.js](https://github.com/huggingface/transformers.js) / [WebGPU ASR 範例](https://huggingface.co/docs/transformers.js/guides/webgpu) | WebGPU/WASM 本地辨識、按需模型 | Apache-2.0 主程式；模型卡與轉換權重另查；歷史研究候選，#993 已關閉；非接口開發門檻 |
| [Whisper](https://github.com/openai/whisper) | 多語言辨識 | MIT 程式及官方模型；實際選用 ONNX 轉換版需獨立驗證；不可用僅英語模型假裝中日韓 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) / [WASM 文件](https://k2-fsa.github.io/sherpa/onnx/wasm/index.html) | 離線 ASR/TTS/VAD，WASM | Apache-2.0 主程式；每個模型語言、授權、檔案大小分開核對 |
| [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | 0.6B/1.7B 系列、自然語言聲線設計與授權錄音、中文／日語／韓語／英語 | Apache-2.0 專案；P3 本地服務候選，需核對實際 checkpoint/VRAM/速度/模型權利，非承諾手機直接跑 |
| [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) / [LICENSE](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/LICENSE) | 跨語言 TTS、授權參考音訊、玩家自架 API | 核對版本授權及第三方權重；中日韓英候選，按實際 API/schema 實測，不當作通用 voice pack |
| [Piper Plus](https://github.com/ayutaz/piper-plus) / [訓練文件](https://github.com/ayutaz/piper-plus/blob/dev/docs/guides/training/training-guide.md) | 輕量多語言 TTS | 目前公開 zs-v1 為六語言，韓語 G2P/runtime 支援不等於已訓練韓語模型；不作唯一中日韓引擎；授權與權重逐件審查 |
| [Pipecat](https://github.com/pipecat-ai/pipecat) | 即時語音 pipeline、打斷、輪流說話 | BSD-2-Clause 主程式；P6 架構研究，不新增平台運算伺服器 |

非開源引擎依賴：[MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)。裝置聲線與辨識可由瀏覽器/OS 提供，可能走網路；不可聲稱一律離線或所有語言免費可用。BYOK 供應商 ElevenLabs/OpenAI 等需在相應 adapter PR 查核各自 API、能力、價格與生命週期，不固定選一家、不預設平台付款。

## 6. 全階段驗收與回退

- 零使用時：純文字故事、prompt/cache、記憶、狀態、分支與既有圖片功能不被語音拖慢或改寫；無額外模型請求、麥克風、網路／大型下載。
- TTS：台詞、角色、語言及版本正確；旁白及心理預設靜音；多角色同名不可串音；取消、停止、切換章節與背景頁面釋放音訊。
- STT：明確啟動、權限與網路揭露、保留原草稿、可編輯預覽、不得自動提交；待送圖片的收件範圍保護不可繞過。
- 本機模型/語音包：下載進度、錯誤、容量、授權、schema、雜湊、可移除及低記憶體回退；安全匯入與 XSS/惡意資料測試。
- Phone/audio：一對一、群聊、鎖定、回溯、重送、跨故事、備份恢復、語音和圖片併存；不將私訊自動公開。
- API：分離 credentials、逐次費用與資料確認、限額、取消、無未授權 retry/fallback、診斷脫敏；原生音訊能力不明時拒絕。
- 工程：依 AGENTS.md 及 regression gate 加入實際案例；Chromium/Firefox/WebKit、320/390/834/1440px、原生 Android/iOS 實機、耳機／音訊焦點、語音辨識準確率、四語言聽感與延遲；mock 不當成真實品質。
- PR CI 通過、合併、Pages 部署、production smoke、真實設備及付費模型各自記錄。付費或真實使用者資料測試需另外授權；只讀規劃 PR 不觸發任何付費請求。
- 每階段有可逆的 feature opt-in、資料相容或明確遷移／回退路徑；保留純文字功能。

## 7. 當前下一步

P1a #989 與 P1b #992 已合併。先完成 #994 選配 STT 接口，接著獨立推進 TTS 接入與玩家錄音／上傳、Phone 語音資產。後續原生音訊理解與通話依能力分階段。任何大型本機模型均由玩家自行取得，無需為基礎使用者預裝或先完成模型研究。
