# 夜灣自帶語音服務：玩家接入指南

2026-11-27。此文件提供接口設定與相容性判斷，不是夜灣代管服務或已驗證模型清單。玩家自行安裝、選擇權重、取得授權並負擔運算或 API 費用；免費裝置語音不需以下設定。

## 基礎及進階路徑

1. 故事最新回覆點「播放台詞」或「聲線」，手機從既有 + 控制中心進入「語音輸入」；Phone 私訊及群聊直接點播放與聲線。裝置聲線不需 API（實際本地聲線、辨識語言及服務可用性依瀏覽器/OS；辨識可能連網）。不需要修改角色卡。
2. 進階使用者選自訂 STT 或 TTS，填寫完整接口網址、服務實際模型 ID、TTS 角色聲線 ID 及選填獨立金鑰。不要只填 /v1 或文字聊天 API。
3. 設定可按保存，API key 與授權不保存；先測試一段無私人資訊的短句，再啟用自動配音。選擇授權額度不是價格估算。
4. 接口需 HTTPS 或同裝置 loopback HTTP，且允許 https://yorubay.com 的 CORS；依瀏覽器確認 local-network access 與麥克風權限。localhost 在手機上指手機本身，不是玩家桌機。不同裝置或遠端連線須自行設置安全 HTTPS 服務、驗證及存取控制，不建議直接暴露未驗證的推論服務到公網。避免 CORS 全開。
5. 不支援或連線失敗可手動切回裝置，不會自動重試、切換供應商、送出文字或產生費用。

## 已實作的協議

| 功能 | 請求 | 回應 |
| --- | --- | --- |
| STT | POST 完整 /audio/transcriptions；multipart file、model、language（zh/ja/ko/en）；選填 Bearer key | JSON text；錄音最多 60 秒、8 MiB；不支援 SSE |
| TTS | POST 完整 /audio/speech；JSON model、voice、input、speed、response_format=mp3；選填 Bearer key | 非串流 MP3 或 WAV；最多 16 MiB，60 秒請求上限 |

服務必須接受上述實際 payload 與資料格式；相容 OpenAI API 的宣稱不保證所有功能或版本相容。TTS 台詞依原文，不自動翻譯。模型、語種、語速、情緒與聲線由服務本身提供。只有文件層級的相容候選，未實跑下列服務或呼叫付費 API。

## 開源候選（使用者自行選擇）

### Speaches：本機語音辨識／配音

官方：https://speaches.ai/installation/ 、https://speaches.ai/usage/speech-to-text/ 、https://speaches.ai/usage/text-to-speech/ 、https://speaches.ai/configuration/

Speaches 提供 OpenAI-compatible 的 faster-whisper STT，以及 Piper/Kokoro TTS，可由玩家自行使用 CPU/GPU 容器。依官方安裝說明選擇版本與裝置，核對權重授權。其設定支援 ALLOW_ORIGINS；只加入所需網站 origin，必要時設 API_KEY。若服務以同裝置預設 8000 port 執行，STT 填 http://localhost:8000/v1/audio/transcriptions；TTS 填 http://localhost:8000/v1/audio/speech。模型 ID 與聲線 ID 從該實際版本模型清單與文件取得，不能假設任意 Whisper/Kokoro/Piper 模型皆支援中文、日語及韓語。初次服務端載入模型可能超過夜灣單次請求逾時，玩家自行先準備服務與模型。

### Qwen3-TTS：自訂聲線候選

模型官方：https://github.com/QwenLM/Qwen3-TTS
相容服務參考：https://github.com/vllm-project/vllm-omni/blob/main/docs/serving/speech_api.md

模型 Python 套件或 Web UI 不等於 HTTP TTS API。vLLM-Omni 的 CustomVoice 服務文件列出 /v1/audio/speech 及 model/voice/input/speed/response_format；可依玩家硬體、版本及服務文件架設後使用現有通用 adapter。例：玩家若依官方示例在同一裝置 8091 port 啟動 CustomVoice，網址 http://localhost:8091/v1/audio/speech、模型 Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice、預設聲線 vivian。實際可用角色、語言、格式與 CORS 以服務回應為準；夜灣目前未傳送 language、instructions、ref_audio、ref_text 等專用欄位。可由玩家在支援的服務端自行建立有權使用的聲線，再以服務端 voice ID 使用通用接口（須實測）。參考音訊模式見下節；一般 CustomVoice 接口仍不傳送專用欄位。

### GPT-SoVITS：原生協議不同

官方：https://github.com/RVC-Boss/GPT-SoVITS ，API 範例及測試：https://github.com/RVC-Boss/GPT-SoVITS/blob/main/test_api_v2_streaming.py

原生 /tts 使用 text、text_lang、ref_audio_path、prompt_lang 等欄位，不是現有 /audio/speech。不能直接將 /tts URL 填入夜灣。玩家可自行使用經驗證的相容橋接器，或等待獨立原生 adapter；夜灣不要求玩家為此安裝所有模型、不直接操作供應商的任意本機路徑或權重、不複製上游程式碼。

## 驗收與故障排除

先確認服務端以單句生成或單次錄音回應成功，再在瀏覽器測試短句。401/403 查獨立 key；404 查完整 endpoint 及模型 ID；格式錯誤查是否返回 SSE/JSON 而非指定音訊；CORS 查網站 origin/預檢及瀏覽器本機網路權限；逾時查服務是否已載入模型。不要將金鑰、原始私人錄音或錯誤中的敏感服務回應貼到公共 issue。

正式支援標示前須有版本化實際協議、裝置瀏覽器與語言測試證據；授權參考音訊、模型包、專用 adapter 只按需增補。不重新建立 #993 的模型研究門檻，也不新增夜灣推論成本。

## 原生音訊理解（不同於 STT/TTS）

使用玩家目前故事 BYOK 模型與完整官方端點。Gemini GenerateContent 接受 WAV/MP3/OGG；OpenAI `https://api.openai.com/v1/chat/completions` 的 GPT Audio 系列或相容 audio-preview，及 OpenRouter `https://openrouter.ai/api/v1/chat/completions` 的明確音訊模型 ID，使用 WAV/MP3。OpenRouter 例 `xiaomi/mimo-v2.5`（官方模型頁 https://openrouter.ai/xiaomi/mimo-v2.5 ，仍需確認當前供應商能力）。不選 auto、preset 或路由別名。確認模型、音訊能力、服務費及資料政策後才傳送；OpenRouter 會將資料送給上游服務。夜灣不自動重試、不改模型、不代付費用。非原生音訊模型仍可使用 STT 或本機語音。真實服務及裝置尚未驗收。

## 參考音訊配音（Qwen3-TTS Base）

依 [vLLM-Omni Speech API](https://docs.vllm.ai/projects/vllm-omni/en/stable/serving/speech_api/) 的 Base task：玩家自行取得 `Qwen/Qwen3-TTS-12Hz-1.7B-Base` 或 `Qwen/Qwen3-TTS-12Hz-0.6B-Base` 相容服務；填完整 `/v1/audio/speech`（同裝置例 `http://localhost:8091/v1/audio/speech`），依服務配置 HTTPS/CORS/驗證。選定角色與台詞，開啟參考音訊模式，選 WAV/MP3（4 MiB/30 秒內），填寫真實逐字稿、選輸出語言並確認聲音權利及本次傳送。夜灣使用 `task_type:Base`、`ref_audio` data URL、`ref_text`、`language` 及非串流 WAV；不傳供應商本機檔案路徑、遠端參考網址或模型權重。此階段每次生成都須確認，不保存參考音檔或永久聲線，也不呼叫 `/audio/voices`。若玩家已在服務端合法建立可使用的聲線 ID，仍可使用原有一般 TTS 模式。上游可依其政策保留輸入，取消不保證免收費。真實引擎、語言與音質尚未實測。


## 日常操作驗收與限制

- 故事、Phone 私訊及群聊共用角色聲線。進階 TTS 設定保存後回到共用聲線頁，明確同意當前章節範圍及用量，才可使用自帶服務；金鑰及授權不跨重新載入／章節。語音輸入不需要重新填寫仍有效的授權。
- NPC 語音訊息保存逐字稿，點擊時合成，而非保存不可變錄音檔。重播自訂服務可能再次計費。
- Phone 一對一點「通話」，確認瀏覽器辨識同意後按住說話、放開停止、確認逐字稿再送出。可另勾選回覆自動播放；未勾選則手動播放。掛斷後不再錄音或播放，已送出的故事回合可能完成。尚非全雙工、群組通話或自訂 STT 通話。
- 實機驗收清單（待實測，不宣稱已通過）：Android Chrome 與 iOS Safari 各測權限允許／拒絕、實際可用本地聲線、鍵盤語音輸入替代、320/390px 通話與掛斷、背景化／鎖屏、語音訊息及自訂服務短句／逾時、切換章節後重新授權。自架服務由玩家自行測試 HTTPS/loopback、CORS 與音訊格式。
