# Stage Capability Contract

日期：2026-10-27  
階段：Phase 2  
前置：PR #850 / Experience Shell Phase 1

## 為什麼需要這一層

夜灣已經同時存在 Reader Context、Gameplay UI、RPG Dashboard、Scene RPG 與 Phone renderer。過去由各模組自行判斷「現在要顯示誰」，容易讓 Player Shell 逐漸累積例外條件。

Stage Capability 將這些判斷收斂成一個平台端 resolver：

```text
作品資料 + 目前故事 state
        ↓
Stage Capability Resolver
        ↓
shell / renderer / presentation / source
        ↓
Player Shell
```

Player Shell 不再自行猜 `gameplay_ui`、`phone_ui` 或 viewport。

這一層是**產品路由，不是新的故事資料層**。

## Stage contract

Stage viewport 分成三層：`mobile`（≤820px）、`compact`（821–1080px）、`desktop`（≥1081px）。compact 是平板／窄桌機，不再被誤標為 mobile。

每次解析回傳：

- `shell`：產品上的舞臺類型。
- `renderer`：平台實際使用的安全 renderer。
- `presentation`：sheet / panel / embedded / overlay。
- `source`：default / gameplay-ui / explicit。
- `available`：這個作品目前可用的舞臺能力。
- `controls`：對應的實際 DOM surface id。
- `persistent`：是否為作品布局的一部分，而不是按需彈出。

目前正式支援：

| shell | renderer | desktop | compact / mobile | 備註 |
| --- | --- | --- | --- | --- |
| reader | reader-context / game-ui | sheet | panel | 沒有專用 Gameplay UI 的預設 |
| gameplay | game-ui | panel | panel | 安全 declarative Gameplay UI |
| rpg-dashboard | game-ui | ≥1430px embedded；以下 panel | panel fallback | 必須有合法 left/right panel |
| scene-rpg | game-ui | ≥1280px embedded；以下 panel | panel fallback | 依實際場景 CSS 斷點 |
| terminal | game-ui | embedded | panel fallback | 平台主控台；作者只宣告安全 panel |
| phone | phone | overlay | overlay | 只有明確指定才可成為 primary Stage |

Visual Novel **尚未加入正式允許清單**。Terminal 自 Phase 3 起正式支援。

## 相容策略

### 一般舊卡

沒有 `gameplay_ui`、沒有明確 Stage 指定：

```text
desktop → reader / reader-context
mobile  → reader / game-ui panel
```

完全沿用 Phase 1 行為。

### Gameplay UI 卡

有合法 `gameplay_ui` panels：

- standard → `gameplay`
- rpg-dashboard → `rpg-dashboard`
- scene-rpg → `scene-rpg`

底層 renderer 仍是既有 Gameplay UI Engine。

### Terminal 卡

Terminal 使用既有 Gameplay UI schema：

```json
{
  "layout": {
    "preset": "terminal",
    "primary_panel": "system"
  }
}
```

`primary_panel` 只能引用同一份 schema 中已存在的 panel id。桌機 1081px 以上以 persistent Stage 顯示；較窄畫面退回按需 Game UI panel。Terminal 不新增資料來源，也不能執行作者程式碼。

### Phone 卡

只有 `phone_ui`：

- Phone 出現在 `available`。
- 原本「📱 手機介面」launcher 繼續存在。
- 不會自動搶走主要 Stage。

只有作品明確使用既有平台意圖：

```json
{
  "play_info_surface": "phone"
}
```

才讓 Phone 成為 primary Stage。

這是刻意的 backward-compatible 策略。現有 Phone 作品不會因平台升級突然改變主要遊玩介面。

## 安全邊界

`stage-capability-core.js` 是 pure resolver：

- 不碰 DOM。
- 不碰 Storage / IndexedDB / localStorage。
- 不做 model call。
- 不做 network request。
- 不讀 API Key。
- 不寫 GameState。
- 不執行作者 JavaScript。

`stage-capability.js` 只能讀：

- 已 normalize 的 Gameplay UI schema。
- 已 normalize 的 Phone display。
- `play_info_surface` 平台意圖。
- viewport。

它只告訴 Player Shell「用哪個平台 renderer」。

作者仍無法提供任意 JS、任意 DOM selector、任意 URL fetch、API Key 讀取、Prompt assembler 覆寫，或 Memory / Context pipeline 覆寫。

## Phone lifecycle

Phone 仍是原本的獨立安全 renderer。Phase 2 只增加 lifecycle event：`bao:phone-stage-visibility`。

當作品明確把 Phone 設成 primary Stage 時：

- 點「舞臺」→ 開啟現有 Phone overlay。
- overlay 開啟 → Stage tab active。
- 關閉 overlay → 回 Story。
- Story 按鈕 → 可關閉 Phone Stage。

如果 Phone 只是 optional capability，原 launcher 行為不變。

## 為什麼不把 Phone 改造成 Gameplay panel

Phone core 已經有自己的 app routing、thread/photo/note 資料結構、interaction/unlock state、media sanitization、bounded merge 與 per-story player override。

強行塞進 Gameplay UI v1 會造成 schema 膨脹、renderer 職責混亂、原作品相容風險，以及多一份狀態同步。因此 Phase 2 採 **capability adapter**，不是 renderer merge。

## 下一步：Visual Novel

Terminal 已依照以下流程落地；Visual Novel 也必須遵守相同流程：

1. 先定義平台 renderer。
2. 定義 declarative schema。
3. 定義可讀 state path。
4. 定義可 draft / commit 的 action 邊界。
5. 加入 Stage Capability allowlist。
6. 建 desktop/mobile fallback。
7. 加 core + browser regression。
8. 才開放 Creator / MCP 使用。

禁止直接：

```text
作者 HTML / JS
↓
main app DOM
↓
API / Storage / Prompt
```

正確方向仍然是：

```text
作者宣告資料
↓
安全 schema
↓
平台 renderer
↓
Stage Adapter
↓
Story / Stage / Control Center
```

## Phase 2 驗收

- Reader 卡 resolve 到 reader。
- Gameplay standard resolve 到 gameplay。
- RPG Dashboard / Scene RPG 保留既有 preset。
- Phone-only 舊卡不改 primary Stage。
- explicit Phone Stage 桌機與手機都能從「舞臺」開啟。
- Phone 關閉後 Stage active state 回到 Story。
- 切 Stage 不修改 GameState。
- Core / Gameplay / Phone / Story controls / mobile reading regression 需維持。
## Responsive contract 對齊

Viewport 三分法繼續用於 Reader／Phone 與平台導航，但不足以描述所有作品布局。adapter 現在將實際 `window.innerWidth` 傳入 pure core 的可選 `width` 參數，決定 persistent shell：

- Terminal：1081px。
- Scene RPG：1280px。
- RPG Dashboard：1430px，且 schema 至少指定一個存在的 left/right panel；否則維持可開啟的 game-ui panel。

窄於各自門檻時，Story 預設隱藏 game-ui，由「舞臺」開啟／收起；不再把 desktop 視為所有 shell 都已常駐。跨越 1081／1280／1430px 時同步關閉先前按需面板、重算舞臺與 aria-controls，不改故事資料。

常駐模式的 controls 指向真正在畫面上的 terminal、scene 或 dashboard host，按「舞臺」將焦點移到該 host；按需模式指向 game-ui。讀取來源、draft-only actions 與作者安全邊界維持不變。RPG Play layout 以三欄顯示作品狀態；Scene Play layout 使用場景／故事兩欄，不預留被隱藏工具側欄的位置；Terminal 使用主控台／故事兩欄。

Core 的 width 缺省時保留舊 viewport 呼叫方式；實際瀏覽器 adapter 一律帶入寬度。新增 boundary regression 會從門檻兩側來回縮放，並跨越 820/821、1080/1081，確認實際可見 host、欄數、aria-controls、焦點及故事／API／messages 一致性。
