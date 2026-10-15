# 夜灣完整作品包 v1

玩家從原有匯入入口選取 `*.yorubay.zip`，預覽後一次保存角色、世界書、正則與原圖。先驗證所有檔案，再以同一筆 IndexedDB transaction 儲存；容量錯誤不覆蓋舊角色。沒有圖片儲存能力時不降級成會遺失圖片的匯入。一般 JSON/PNG 流程維持相容。

## 結構

```json
{
  "schema":"yorubay-work-package",
  "version":1,
  "character":"character.json",
  "worldbooks":[{"path":"worldbooks/port.json","enabled":true,"pinned":false}],
  "regex":"regex.json",
  "assets":[
    {"id":"cover","path":"assets/cover.png","role":"cover","name":"封面"},
    {"id":"port","path":"assets/port.webp","role":"scene","name":"碼頭","when":[{"path":"location","equals":"碼頭"}]},
    {"id":"smile","path":"assets/smile.png","role":"portrait","name":"微笑","when":[{"path":"modules.visual.expression","equals":"微笑"}]}
  ],
  "adaptation":{"preserved":["原始設定與原圖"],"adapted":["原生場景版面"],"manual":[]}
}
```

- `manifest.json` 必須在根目錄。角色是原生夜灣卡；世界書各自使用既有 `yorubay-worldbook-pack`。
- 分檔 worldbooks 還原到該角色的 `initial_state.worldbookLibrary`，保留啟用與 pinned 狀態。全局、劇本等文字依原作既有 content 欄位保存，不增加每輪全量世界書提示詞。
- regex 檔是原作者 `rules`／`regex_scripts`，隨角色交給既有作者 Regex 綁定流程；維持玩家既有顯示、腳本與外部資產權限。
- `source_uri` 可保留原 Regex 內使用的圖片 URI。顯示時將 `embeded://<path>`、`yorubay-asset://<id>` 與 source_uri 對應成該作品本機 Blob URL；原始規則不修改。
- 圖片角色為 cover/background/scene/portrait/gallery。場景與立繪的 when 條件全部符合才顯示；優先採用條件數較多的項目，相同時採清單順序。封面、閱讀背景各限一張。其他圖片從現有故事功能中的作品圖片檢視。
- 使用 `scene-rpg` 的手機版可展開場景縮圖；桌機沿用原生大場景與立繪疊圖。不發出圖片／模型請求，不將圖片或素材清單加入提示詞。
- 原圖保存為 Blob，角色保存可攜 ID；再次匯出重建分檔 ZIP，裝置搬家包也包含原圖。附件原檔不執行。

## 容量與相容性

ZIP 32 MiB、展開 64 MiB、單檔 10 MiB、JSON 8 MiB、256 檔、200 張 PNG/JPEG/WebP/GIF。原有世界書 6 包／3.5 MB 和獨立 JSON/PNG metadata 1 MiB 上限維持。MCP 目前單次交付 ZIP 12 MiB，超過時需分批整理。

支援 ZIP stored/deflate，檢查目錄、路徑、檔名一致性、CRC、大小、重複路徑；拒絕穿越路徑、加密、symlink、多磁碟及 ZIP64。解壓縮過程檢查實際輸出大小。共用的 core 在 Creator 以 `.cjs`、主站以 `.js` 保存相同內容。

外部 CHARX 先由 Creator MCP 讀取與適配，再交付本格式。沒有夜灣 manifest 的 ZIP 不在前端靜默猜測、截斷或套用。不支援的外平台程式、缺少的遠端圖片與待確認觸發條件列入 adaptation.manual。
