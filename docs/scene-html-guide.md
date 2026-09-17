# BAO/LAB 場景 HTML：作者範例與實作規格

> 這份文件是作者可使用的場景排版範例與待實作規格，**不是已上線的模式切換功能**。

## 玩家可選模式（待實作）

- **原生閱讀**：不要求模型產生 HTML；以 BAO/LAB 原生訊息與原生狀態欄呈現。
- **節省 Token 的華麗模式**：本機保存作者提供的模板；模型只輸出敘事、必要狀態變化和場景識別碼。沒有適用模板時回退原生排版，不暗中要求模型輸出整份 HTML。
- **自由 HTML 模式**：允許模型依場景輸出經過安全清理的 HTML；提示玩家可能增加輸入／輸出 Token。不得執行任意 JavaScript。

狀態欄顯示模式應獨立設定：原生／作者排版／隱藏。狀態的權威資料應存於世界狀態，而非 HTML 字串。

## 場景範例：匿名論壇

```html
<div style="padding:16px;background:#151b29;color:#e5edf7;border-radius:14px">
  <small style="color:#a5b4c8">匿名論壇 · 23:55</small>
  <div style="margin-top:12px;padding:14px;background:#253147;border-radius:10px">
    <strong>林沉風 · 回覆</strong>
    <p>「一個路過的人。剛好看到你的文章，覺得有些話想說。」</p>
  </div>
</div>
```

## 場景範例：現實見面

```html
<div style="padding:20px;background:#29251f;color:#f2e9db;border-radius:14px">
  <small style="color:#d6b98c">台北 · 深夜咖啡館</small>
  <p>窗外的雨沿著玻璃緩緩滑落。林沉風將咖啡杯放回桌面，抬眼看向你。</p>
  <p>「原來你本人，比文字裡安靜得多。」</p>
</div>
```

## 場景範例：劇情轉折

```html
<div style="padding:20px;background:#1b1b24;color:#e4e4e7;border-radius:14px">
  <small style="color:#a1a1aa">凌晨 02:17</small>
  <hr>
  <p><em>他沒有回答。</em></p>
  <p>手機螢幕暗了下去，房間重新陷入寂靜。</p>
</div>
```

## 待實作資料契約示意

```json
{
  "scene": "real-world",
  "narration": "林沉風將咖啡杯放回桌面。",
  "dialogue": "原來你本人，比文字裡安靜得多。",
  "statusPatch": {}
}
```

場景代碼只能在作者允許的集合中選擇；未提供有效代碼時沿用上一個場景。模板存本機，不隨每次 API 請求傳送；模型仍須接收簡短的場景代碼規則，會使用少量輸入 Token。所有外部 HTML 必須先安全清理，不允許 script、事件處理器、iframe、任意 JS 或接觸 API Key。切換模式時，必須同步調整模型輸出要求，不能僅在畫面上隱藏 HTML。
