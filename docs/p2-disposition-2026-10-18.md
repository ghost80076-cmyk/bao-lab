# P2 剩餘項目處置清單（2026-10-18）

基準為 #742 的產品版本；本清單區分已完成、必要保留與後續優化。下表提供可閱讀的逐檔清單；完整引用／blob SHA 見 [證據 JSON](p2-closeout-evidence-2026-10-18.json)。

## 明確處置

| 項目 | 判定 | 原因／驗證 |
| --- | --- | --- |
| 品牌重複 CSS 與工具選單的同檔後置覆蓋 | 已修正 | #736、#737；載入回歸、六寬度 × 五主題與截圖。 |
| 六條主機 Chromium 安裝 | 已整理 | #734、#735；共同安裝與觸發依賴，保留專用測試。 |
| 八條部署資產流程 | 已整理 | #739–#741；同輪 bytes 比對；#741 合併後八流程實際成功。 |
| Fast E2E 空組／缺檔假綠燈 | 已修正 | #742；10 項回歸與主線實際四組 E2E 通過。 |
| 其他 CSS、媒體條件與主題覆蓋 | 保留 | 60 檔均有正式引用；手機、平板與桌面條件不同。沒有可直接視為廢檔的項目；不宣稱所有 selector 已審計。 |
| 預裝容器、多瀏覽器矩陣與 push-only 安裝 | 保留 | 執行環境與驗證責任不同，不能一律套主機 Chromium 安裝。 |
| 正式部署／稽核流程 | 保留 | 權限與操作邊界不同，不為去重合併。 |
| SEO、公開作者資料、robots／sitemap 語意檢查 | 保留 | 驗證內容關聯及公開行為，不等於檔案相同。 |
| BAO 識別、storage key 與備份格式 | 保留 | 避免破壞資料；舊格式相容回歸通過。 |
| 舊核心／混合快取 fallback | 保留 | 有明列的相容邊界，API／App wrapper 回歸通過；不是任意第三方擴充完整相容保證。 |
| P0／P1 evidence JSON 與歷史報告 | 保留 | 各自指定版本的證據；目前狀態入口已區分歷史。 |

## 後續待辦（不阻擋本次工程結案）

| ID | 項目 | 重新啟動條件 |
| --- | --- | --- |
| F1 | 其他 CSS 的整體分層或檔案合併（後續優化） | 有可重現覆蓋問題、量測到的載入成本或明確維護需求再另開範圍。 |
| F2 | 容器／條件式流程的 Node 安裝或其餘驗證器再去重（後續優化） | 相同維護變更多次同步，並能保留既有權限、執行時機及案例責任。 |
| F3 | 舊文件歸檔與相容分支移除（後續優化） | 先有取代文件、引用稽核與資料遷移證據；不只依檔案年齡刪除。 |
| O1 | 玩家錢包與 Provider 真實帳單逐筆對帳（獨立營運待辦） | 取得正式帳單／錢包記錄；不列為本次工程已完成。 |

## 37 條 Workflow 的逐檔判定

| Workflow（原始定義） | Job | 判定 | 依據 |
| --- | --- | --- | --- |
| [author-regex-inline.yml](../.github/workflows/author-regex-inline.yml) | `inline` | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| [author-regex-live.yml](../.github/workflows/author-regex-live.yml) | `live-author-ui` | 已完成指定修改 | 已完成：共用部署資產比對；已完成：共用 Chromium 安裝 |
| [aws-relay-model-registry-audit.yml](../.github/workflows/aws-relay-model-registry-audit.yml) | `audit` | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| [aws-ssm-oidc-audit.yml](../.github/workflows/aws-ssm-oidc-audit.yml) | `audit` | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| [bao-mascot-live.yml](../.github/workflows/bao-mascot-live.yml) | `verify-mascot` | 已完成指定修改 | 已完成：共用部署資產比對 |
| [browser-e2e.yml](../.github/workflows/browser-e2e.yml) | `chromium-core`, `onboarding`, `story-controls`, `cross-browser-smoke`, `pages-smoke` | 已完成指定修改 | 已完成：清單缺檔／空組不得成功 |
| [character-studio-live.yml](../.github/workflows/character-studio-live.yml) | `verify-live-recovery` | 已完成指定修改 | 已完成：共用部署資產比對 |
| [chat-experience-live.yml](../.github/workflows/chat-experience-live.yml) | `check-chat-experience` | 已完成指定修改 | 已完成：共用部署資產比對 |
| [chat-reading-scroll.yml](../.github/workflows/chat-reading-scroll.yml) | `reading-scroll`, `pages-live` | 已完成指定修改 | 已完成：共用部署資產比對 |
| [chat-ui-simplify.yml](../.github/workflows/chat-ui-simplify.yml) | `focused-browser` | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| [core-tests.yml](../.github/workflows/core-tests.yml) | `node-core` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [credits-pilot-integration.yml](../.github/workflows/credits-pilot-integration.yml) | `tests-and-live-assets` | 已完成指定修改 | 已完成：共用部署資產比對 |
| [desire-district-card.yml](../.github/workflows/desire-district-card.yml) | `verify` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [editorial-visual.yml](../.github/workflows/editorial-visual.yml) | `visual-and-functional-smoke` | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| [first-run-live.yml](../.github/workflows/first-run-live.yml) | `verify-first-run` | 已完成指定修改 | 已完成：共用部署資產比對 |
| [full-browser-e2e.yml](../.github/workflows/full-browser-e2e.yml) | `cross-browser-full`, `live-pages-full` | 保留 | 完整 Chromium／Firefox／WebKit 矩陣及排程，不套用單一 Chromium 安裝。 |
| [gameplay-ui-engine.yml](../.github/workflows/gameplay-ui-engine.yml) | `gameplay-ui-core`, `browser-gameplay-ui` | 已完成指定修改 | 已完成：共用 Chromium 安裝 |
| [maintenance-core.yml](../.github/workflows/maintenance-core.yml) | `maintenance-core` | 已完成指定修改 | 已完成：集中驗證 helper 與 runner 回歸 |
| [mobile-story-entry.yml](../.github/workflows/mobile-story-entry.yml) | `story-entry` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [native-archive-catalog.yml](../.github/workflows/native-archive-catalog.yml) | `archive-regression` | 保留 | 預裝 Playwright 容器保有專用案例；重裝主機瀏覽器會增加成本。 |
| [natural-dialogue-regression.yml](../.github/workflows/natural-dialogue-regression.yml) | `dialogue-regression` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [npc-presence.yml](../.github/workflows/npc-presence.yml) | `presence` | 保留 | PR 執行 Node 契約，push 才安裝瀏覽器並驗證線上內容，時機不同。 |
| [pages-live-smoke.yml](../.github/workflows/pages-live-smoke.yml) | `verify-live-pages` | 保留 | SEO、作者資料關聯、robots／sitemap 與圖像尺寸等語意驗收，責任不等同檔案 bytes 比對。 |
| [persona-picker-sync.yml](../.github/workflows/persona-picker-sync.yml) | `persona-picker` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [privacy-policy-check.yml](../.github/workflows/privacy-policy-check.yml) | `policies` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [production-model-binding-deploy.yml](../.github/workflows/production-model-binding-deploy.yml) | `deploy` | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| [production-model-registry-apply.yml](../.github/workflows/production-model-registry-apply.yml) | `contract`, `model-bindings` | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| [production-model-registry-audit.yml](../.github/workflows/production-model-registry-audit.yml) | `contract`, `production-audit` | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| [pwa-index-activation.yml](../.github/workflows/pwa-index-activation.yml) | `activation` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [pwa-install.yml](../.github/workflows/pwa-install.yml) | `test` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [scene-story-preferences.yml](../.github/workflows/scene-story-preferences.yml) | `preferences` | 保留 | PR 執行 Node 契約，push 才安裝瀏覽器並驗證線上內容，時機不同。 |
| [work-title-npc.yml](../.github/workflows/work-title-npc.yml) | `title-regression` | 保留 | 預裝 Playwright 容器保有專用案例；重裝主機瀏覽器會增加成本。 |
| [worker-production-deploy.yml](../.github/workflows/worker-production-deploy.yml) | `deploy` | 保留 | 正式操作／部署／稽核的權限、審核與執行邊界有獨立用途，未納入一般測試安裝去重。 |
| [world-mod-packs.yml](../.github/workflows/world-mod-packs.yml) | `mod-pack-core-and-browser` | 已完成指定修改 | 已完成：共用部署資產比對 |
| [world-module-state-echo.yml](../.github/workflows/world-module-state-echo.yml) | `state-echo` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [worldbook-library.yml](../.github/workflows/worldbook-library.yml) | `verify`, `sunrise-live-assets` | 保留 | 具名功能／政策／資料或核心回歸，測試責任與觸發範圍不同；沒有本次應合併或刪除的重複證據。 |
| [worldbook-recall-mode.yml](../.github/workflows/worldbook-recall-mode.yml) | `recall-and-cache`, `deployed-general-catalog` | 已完成指定修改 | 已完成：共用 Chromium 安裝 |

## 60 份 CSS 的正式引用

以下沿用 #742 證據，逐一核對目前檔案 blob 與引用仍存在。HTML 是靜態引用，JS 是程式內的引用位置；不據此推論所有功能都同時載入，也不把引用存在等同逐 selector 語意審計。所有列項均保留；媒體條件、主題與載入順序仍有用途，分層或合併須符合 F1 啟動條件。

| CSS | 正式引用檔案 | 處置 |
| --- | --- | --- |
| [account-v2.css](../css/account-v2.css) | [account.html](../account.html) | 保留 |
| [action-choice-dock.css](../css/action-choice-dock.css) | [index.html](../index.html) | 保留 |
| [actor-library-experience.css](../css/actor-library-experience.css) | [js/story-persona-manager.js](../js/story-persona-manager.js) | 保留 |
| [actor-mode.css](../css/actor-mode.css) | [js/actor-mode.js](../js/actor-mode.js) | 保留 |
| [author-profile.css](../css/author-profile.css) | [author.html](../author.html) | 保留 |
| [bao-brand-v2.css](../css/bao-brand-v2.css) | [about-bao-lab.html](../about-bao-lab.html)、[api-guide.html](../api-guide.html)、[author.html](../author.html)、[bao-mascot.html](../bao-mascot.html)、[character-studio.html](../character-studio.html)、[index.html](../index.html)、[js/bao-visual-ui.js](../js/bao-visual-ui.js)、[mcp-guide.html](../mcp-guide.html)、[quick-start.html](../quick-start.html) | 保留 |
| [bao-cinematic-home.css](../css/bao-cinematic-home.css) | [index.html](../index.html)、[js/brand-ui.js](../js/brand-ui.js) | 保留 |
| [bao-editorial-cinema.css](../css/bao-editorial-cinema.css) | [js/bao-gallery-focus.js](../js/bao-gallery-focus.js) | 保留 |
| [bao-editorial-polish.css](../css/bao-editorial-polish.css) | [js/bao-gallery-focus.js](../js/bao-gallery-focus.js) | 保留 |
| [bao-editorial.css](../css/bao-editorial.css) | [index.html](../index.html)、[js/bao-visual-ui.js](../js/bao-visual-ui.js) | 保留 |
| [bao-image-quality.css](../css/bao-image-quality.css) | [bao-mascot.html](../bao-mascot.html)、[index.html](../index.html)、[js/bao-visual-ui.js](../js/bao-visual-ui.js) | 保留 |
| [bao-mascot.css](../css/bao-mascot.css) | [js/bao-mascot.js](../js/bao-mascot.js)、[js/bao-visual-ui.js](../js/bao-visual-ui.js) | 保留 |
| [bao-visual-ui.css](../css/bao-visual-ui.css) | [index.html](../index.html)、[js/bao-visual-ui.js](../js/bao-visual-ui.js) | 保留 |
| [base.css](../css/base.css) | [account.html](../account.html)、[admin-wallet.html](../admin-wallet.html)、[author.html](../author.html)、[character-studio.html](../character-studio.html)、[index.html](../index.html)、[regex-manager.html](../regex-manager.html) | 保留 |
| [brand-community.css](../css/brand-community.css) | [index.html](../index.html)、[js/brand-ui.js](../js/brand-ui.js) | 保留 |
| [brand-home.css](../css/brand-home.css) | [account.html](../account.html)、[admin-wallet.html](../admin-wallet.html)、[index.html](../index.html)、[js/brand-ui.js](../js/brand-ui.js) | 保留 |
| [character-status.css](../css/character-status.css) | [js/character-status-ui.js](../js/character-status-ui.js) | 保留 |
| [character-studio-flow.css](../css/character-studio-flow.css) | [js/character-studio-flow.js](../js/character-studio-flow.js) | 保留 |
| [character-studio-lifecycle.css](../css/character-studio-lifecycle.css) | [character-studio.html](../character-studio.html) | 保留 |
| [character-studio.css](../css/character-studio.css) | [character-studio.html](../character-studio.html) | 保留 |
| [chat-desktop-reading.css](../css/chat-desktop-reading.css) | [js/author-regex-mobile.js](../js/author-regex-mobile.js) | 保留 |
| [chat-experience.css](../css/chat-experience.css) | [js/chat-shell-fix.js](../js/chat-shell-fix.js) | 保留 |
| [chat-tool-navigation.css](../css/chat-tool-navigation.css) | [js/chat-tool-navigation.js](../js/chat-tool-navigation.js) | 保留 |
| [commentary-mods.css](../css/commentary-mods.css) | [js/commentary-mods.js](../js/commentary-mods.js) | 保留 |
| [context-health.css](../css/context-health.css) | [js/context-health.js](../js/context-health.js) | 保留 |
| [conversation-search.css](../css/conversation-search.css) | [js/conversation-search.js](../js/conversation-search.js) | 保留 |
| [experience-preferences.css](../css/experience-preferences.css) | [js/experience-preferences.js](../js/experience-preferences.js) | 保留 |
| [explore-discovery.css](../css/explore-discovery.css) | [index.html](../index.html) | 保留 |
| [explore-zones.css](../css/explore-zones.css) | [index.html](../index.html)、[js/bao-visual-ui.js](../js/bao-visual-ui.js) | 保留 |
| [first-run-desktop.css](../css/first-run-desktop.css) | [index.html](../index.html)、[js/brand-ui.js](../js/brand-ui.js) | 保留 |
| [gameplay-ui.css](../css/gameplay-ui.css) | [index.html](../index.html) | 保留 |
| [host-club-simulator.css](../css/host-club-simulator.css) | [index.html](../index.html) | 保留 |
| [interpretation-mods.css](../css/interpretation-mods.css) | [js/interpretation-mods.js](../js/interpretation-mods.js) | 保留 |
| [k-idol-survival-simulator.css](../css/k-idol-survival-simulator.css) | [index.html](../index.html) | 保留 |
| [memory-preferences.css](../css/memory-preferences.css) | [index.html](../index.html) | 保留 |
| [memory-workbench.css](../css/memory-workbench.css) | [js/memory-workbench-core.js](../js/memory-workbench-core.js) | 保留 |
| [mobile-reading-layout.css](../css/mobile-reading-layout.css) | [js/mobile-reading-layout.js](../js/mobile-reading-layout.js) | 保留 |
| [model-guide.css](../css/model-guide.css) | [js/model-guide.js](../js/model-guide.js) | 保留 |
| [narrative-settings.css](../css/narrative-settings.css) | [js/narrative-settings.js](../js/narrative-settings.js) | 保留 |
| [night-sky-magic-academy.css](../css/night-sky-magic-academy.css) | [index.html](../index.html) | 保留 |
| [player-builder-v2.css](../css/player-builder-v2.css) | [js/player-builder-v2.js](../js/player-builder-v2.js) | 保留 |
| [player-settings.css](../css/player-settings.css) | [js/player-settings.js](../js/player-settings.js) | 保留 |
| [player-shell-v2.css](../css/player-shell-v2.css) | [index.html](../index.html)、[js/player-shell-v2.js](../js/player-shell-v2.js) | 保留 |
| [player-text-replace-mod.css](../css/player-text-replace-mod.css) | [js/player-text-replace-mod.js](../js/player-text-replace-mod.js) | 保留 |
| [policy.css](../css/policy.css) | [age-content-policy.html](../age-content-policy.html)、[creator-policy.html](../creator-policy.html)、[lights-refund-policy.html](../lights-refund-policy.html)、[lights.html](../lights.html)、[policies.html](../policies.html)、[privacy.html](../privacy.html)、[terms.html](../terms.html) | 保留 |
| [public-works.css](../css/public-works.css) | [works/index.html](../works/index.html)、[works/k-idol-survival-simulator.html](../works/k-idol-survival-simulator.html)、[works/linchenfeng.html](../works/linchenfeng.html)、[works/night-sky-magic-academy.html](../works/night-sky-magic-academy.html)、[works/open-world-real-persona.html](../works/open-world-real-persona.html) | 保留 |
| [pwa-install.css](../css/pwa-install.css) | [index.html](../index.html)、[pwa-head.html](../pwa-head.html)、[pwa-preview.html](../pwa-preview.html) | 保留 |
| [reader-context.css](../css/reader-context.css) | [js/reader-context.js](../js/reader-context.js) | 保留 |
| [story-branches.css](../css/story-branches.css) | [js/story-branches.js](../js/story-branches.js) | 保留 |
| [story-control-center.css](../css/story-control-center.css) | [js/story-control-center.js](../js/story-control-center.js) | 保留 |
| [story-extensions-center.css](../css/story-extensions-center.css) | [js/story-extensions-center.js](../js/story-extensions-center.js) | 保留 |
| [story-history.css](../css/story-history.css) | [js/story-history.js](../js/story-history.js) | 保留 |
| [story-quick-commands.css](../css/story-quick-commands.css) | [js/story-quick-commands.js](../js/story-quick-commands.js) | 保留 |
| [story-reader.css](../css/story-reader.css) | [js/story-reader.js](../js/story-reader.js) | 保留 |
| [story-start-readiness.css](../css/story-start-readiness.css) | [js/story-start-readiness.js](../js/story-start-readiness.js) | 保留 |
| [story-tools.css](../css/story-tools.css) | [js/story-tools.js](../js/story-tools.js) | 保留 |
| [structured-opening.css](../css/structured-opening.css) | [index.html](../index.html) | 保留 |
| [work-package.css](../css/work-package.css) | [js/work-package.js](../js/work-package.js) | 保留 |
| [world-module-manager.css](../css/world-module-manager.css) | [js/world-module-manager.js](../js/world-module-manager.js) | 保留 |
| [world-modules.css](../css/world-modules.css) | [js/world-module-ui.js](../js/world-module-ui.js) | 保留 |

## 必要保留的執行與相容邊界

| 邊界 | 對應檔案／驗證 | 保留理由與後續條件 |
| --- | --- | --- |
| 媒體條件與五主題覆蓋 | [工具選單 CSS](../css/chat-tool-navigation.css)、[六寬度 × 五主題測試](../tests/e2e/tool-drawer-boundaries.spec.cjs)；其餘引用見上表 | 手機、平板、桌面及主題條件不同。#737 的畫面證據限該批範圍；其他 CSS 需 F1 的具體問題或量測再開工。 |
| 預裝容器 | `browser-e2e.yml`、`native-archive-catalog.yml`、`work-title-npc.yml`、`world-mod-packs.yml`（定義連結見 workflow 表） | 使用已含瀏覽器的 Playwright 容器，專用案例仍需保留；不能直接改成主機 Chromium 安裝。F2 必須保留容器及原有案例責任。 |
| 條件式安裝 | `npc-presence.yml`、`scene-story-preferences.yml` | PR 跑 Node 契約；push 才安裝瀏覽器並執行線上檢查。F2 必須保留條件與步驟時機。 |
| 多瀏覽器完整排程 | `full-browser-e2e.yml` | Chromium／Firefox／WebKit 完整矩陣與排程有獨立用途；不能用單瀏覽器 smoke 代替。 |
| 正式操作權限 | `aws-*.yml`、`production-model-*.yml`、`worker-production-deploy.yml`（逐檔見上表） | 各自的 OIDC／secret 使用、手動輸入、確認及部署邊界以原始定義為準。一般 CI 去重不授權改動正式操作，也不觸發 apply。 |
| 語意 smoke | [Pages smoke](../.github/workflows/pages-live-smoke.yml) | SEO、公開作者資料關聯、robots／sitemap、圖像尺寸及公開行為需要獨立驗收；資產 bytes 相同不能取代。 |
| 舊資料與內部識別 | [品牌相容原則](yorubay-brand-migration.md)、[舊資料回歸](../tests/legacy-brand-compat-core.cjs)、[舊資料 fixtures](../tests/fixtures/legacy-bao-lab/compatibility-fixtures.json) | 保留 BAO globals、DOM／CSS 識別、storage key、備份與匯入格式。改名或移除須先有 F3 的引用稽核與資料遷移證據；既有 fixtures 通過不等同所有真實玩家資料已遷移。 |
| 舊核心與混合快取 fallback | [擴充鏈與相容邊界](frontend-extension-chain.md)、[API wrapper 回歸](../tests/api-send-wrapper-core.cjs)、[App wrapper 回歸](../tests/app-send-message-wrapper-core.cjs) | 舊快取可能沒有新註冊介面，fallback 仍需接續原呼叫；排序限具名 segment，不跨 opaque legacy boundary。F3 移除前須證明舊載入組合已退出並驗證替代行為；不承諾任意第三方擴充完整相容。 |
| 歷史文件與 evidence | [P0 結案](p0-closeout-2026-10-18.md)、[P1 結案](p1-core-closeout-2026-10-18.md)、[目前維護狀態](maintenance-status.md) | 歷史證據限定指定 commit。F3 歸檔需有取代文件及引用稽核，不以檔案年齡刪除；相容程式移除另需遷移證據。 |

## 盤點界線

60 份 CSS 的正式引用均已列入 JSON；37 條 workflow 以用途分類。基準共有 119 份 Markdown，僅記錄目錄與歷史／現行責任，不宣稱本輪逐行讀完全部文件。保留不代表永久不能改；若新增可重現故障，另按影響分級處理。
