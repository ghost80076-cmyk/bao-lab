# Story Scene Prompt

## Goal

讓夜灣把「故事正在發生的這一刻」整理成可攜式的圖片／影片生成提示詞，而不是由夜灣承諾或代替玩家完成圖片／影片生成。

產品定位：**夜灣理解故事，把這一刻翻譯成畫面。在哪裡生成，由玩家決定。**

V1 不串接圖片／影片 Provider、不建立官方影像計費、不承諾生成結果。

## Why

夜灣真正的優勢不是成為另一個生圖網站，而是已經知道故事上下文：當前場景、在場人物、穩定外貌、服裝、動作、時間、環境、關係與最近發生的事件。

不同影像 Provider 對內容政策、鏡頭遵循、角色一致性、reference image、影片重構與成本的差異很大。若夜灣直接販售影像生成，容易出現 Provider 已產生成本、但玩家認為結果不符合要求的情況。

因此 V1 只負責：

`story state -> compact visual context -> selected text LLM -> portable prompt`

玩家可以把結果複製到自己喜歡的網站、ComfyUI、本地模型或其他影像工具。

## V1 user flow

在故事內提供次要操作：

> 🎨 生成畫面提示詞

玩家可選：

- `圖片`：產生靜態畫面 Prompt
- `影片`：產生適合 image-to-video / text-to-video 的動態 Prompt
- `自動`：由 LLM 依玩家描述判斷

可選的簡單畫面偏好：

- 風格：自動 / 寫實 / 電影感 / 動漫 / 插畫 / 自訂
- 構圖：自動 / 特寫 / 半身 / 全身 / 第一人稱 / 廣角 / 自訂
- 玩家補充要求：自由文字，例如「低機位、由下往上、近大遠小」

這些選項只協助 LLM 編譯 Prompt，不代表夜灣承諾特定外部模型一定能完成。

## Context contract

建立精簡 `visual_context`，只提供生成畫面需要的故事事實：

```json
{
  "scene": {
    "location": "",
    "time": "",
    "weather": "",
    "lighting": "",
    "mood": ""
  },
  "characters": [
    {
      "id": "",
      "name": "",
      "appearance": "",
      "clothing": "",
      "pose_action": "",
      "expression": ""
    }
  ],
  "camera": {
    "viewpoint": "",
    "shot": "",
    "angle": "",
    "distance": "",
    "lens_or_perspective": ""
  },
  "continuity": {
    "stable_character_traits": [],
    "current_scene_facts": []
  },
  "player_visual_instruction": ""
}
```

不要為了寫 Prompt 把完整 RP transcript、API key、session/account secrets 或與畫面無關的長期記憶塞給模型。

## LLM source

Prompt 生成沿用玩家當前可用的文字 LLM 路徑：

- 玩家自己的 API / BYOK：依既有 BYOK 規則
- 夜灣 Hosted 模型：依既有文字模型燈火規則

V1 **沒有額外的圖片／影片生成費用**。夜灣只支付／計算這次文字 LLM 的 Prompt 編譯成本。

不要建立 `image_generation` wallet、每張圖片價格或影像 Provider reserve/settle 流程。

## Output contract

LLM 應回傳結構化結果，UI 不應只顯示一大段無法理解的文字。

```json
{
  "understanding": "用玩家看得懂的方式簡述這張畫面",
  "image_prompt": "",
  "video_prompt": "",
  "negative_prompt": "",
  "continuity_prompt": "",
  "notes": []
}
```

### understanding

先讓玩家確認 AI 是否理解正確，例如場景、人物、動作與鏡位。

### image_prompt

Provider-neutral 的主要圖片提示詞。不要預設玩家使用哪一家服務。

### video_prompt

著重動作、攝影機運動、時間變化與需要維持不變的元素。若玩家只選圖片，可不產生。

### negative_prompt

只作為可選輔助。部分模型不使用 negative prompt，因此 UI 不應宣稱所有模型都有效。

### continuity_prompt

只包含跨張圖片值得固定的外貌／服裝／視覺識別資訊，方便玩家自行重複使用。

## Prompt priority

1. 玩家這一次明確提出的畫面／鏡頭要求
2. 當前可觀察的故事狀態
3. 角色穩定外貌與 continuity facts
4. 作品已有的視覺風格提示
5. 中性預設

不得讓 Prompt 的生成結果反向改寫 canonical story state。

## Portability

V1 預設輸出 **通用 Prompt**。

後續可以加入可插拔 Prompt Adapter，例如：

- Generic
- FLUX
- Stable Diffusion / SDXL
- ComfyUI workflow helper
- image-to-video
- 特定 Provider（只有在確定格式真的需要差異時）

Adapter 只改寫 Prompt 表達，不把夜灣綁死在某一家生成服務。

## UX copy

推薦主按鈕：

> 生成畫面提示詞

結果頁：

- `AI 理解的畫面`
- `圖片 Prompt`
- `影片 Prompt`（需要時）
- `Negative Prompt`（可選）
- `角色一致性`（需要時）
- `複製完整 Prompt`

輔助說明：

> 夜灣會依目前故事整理提示詞。你可以複製到自己喜歡的圖片／影片生成工具；實際生成效果與內容規則由你選擇的工具決定。

避免使用：

- 「夜灣幫你生成圖片」
- 「一定保持角色一致」
- 「一定照此鏡位生成」
- 「支援所有生圖網站」

## Local-first / privacy

- Prompt 結果預設只存在目前裝置／故事工作階段，除非玩家主動保存。
- 不建立夜灣雲端圖片作品庫。
- 不把完整故事歷史送往不必要的第三方影像 Provider；V1 根本不呼叫影像 Provider。
- 不把玩家 API key 寫入 Prompt、故事備份或剪貼簿內容。

## Out of scope for V1

- 夜灣官方圖片生成
- 夜灣官方影片生成
- 圖片／影片 Provider routing
- 圖片／影片專用燈火計價
- GPU hosting
- 自動上傳至外部生成網站
- 保證角色一致性
- 保證外部模型接受任何內容
- 自動繞過外部服務的內容政策

## Future extension

如果未來某個影像 Provider 的成本、政策、品質與失敗退款機制足夠穩定，可以把它作為**額外可插拔出口**，而不是改變 Scene Prompt 的核心定位。

也可以支援玩家自己的本地端點（例如 ComfyUI）作為 Local-first 進階能力，但應另開 implementation PR。

## Acceptance criteria

- [ ] 故事中可以產生通用 Image Prompt，而不需要圖片 Provider。
- [ ] 可選擇產生 Video Prompt。
- [ ] 玩家可加入自然語言鏡頭／構圖要求。
- [ ] 先顯示 AI 對畫面的理解，方便玩家發現誤解。
- [ ] Prompt 會利用當前場景與角色 continuity，而不是要求玩家重新描述整個故事。
- [ ] 不把完整 transcript 當成預設 Prompt context。
- [ ] BYOK / Hosted 只沿用既有文字 LLM 路徑。
- [ ] 不新增圖片／影片專用扣燈流程。
- [ ] 可以一鍵複製完整 Prompt。
- [ ] UI 清楚說明外部工具的實際生成結果與政策不由夜灣保證。
- [ ] 功能關閉時不影響現有 RP。
- [ ] 手機端不遮擋輸入框與主要故事操作。
