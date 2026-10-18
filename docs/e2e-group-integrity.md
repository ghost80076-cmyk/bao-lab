# Fast Browser E2E 清單完整性

Chromium 四組矩陣保留原有 42 個 spec 路徑，改由 `scripts/run-e2e-group.cjs` 讀取 `SPEC_LIST` 並呼叫原 npm Playwright 命令。沒有修改分組、測試範圍、瀏覽器、容器、timeout、產物或 PR／push 條件。

原 inline bash 只收集 `-f` 成功的路徑，缺檔直接略過；若整組都不存在，會輸出 skipping 並 exit 0。此行為可重現：使用一個刻意不存在的測試路徑，原 runner 成功退出，新 runner 失敗退出並列出缺檔。當前原清單的 42 個檔案均存在；此修正不是宣稱原先有 42 個測試沒有執行。

新的契約：

- 空清單、全空白、缺少任一檔案或把目錄列成檔案，一律在呼叫 npm 前失敗，列出缺少的路徑。
- 合法清單只略過空行、處理 CRLF 與行首尾空白，按原順序傳入各個參數；路徑中的空格保留。
- 不透過 shell 組裝 npm 指令；Playwright 非零結束碼直接傳回。子程序無法啟動或遭 signal 中止也不能算成功。

Maintenance core 執行 `tests/e2e-group-runner.test.cjs` 的 10 項回歸。真正瀏覽器測試仍由原 Chromium 矩陣執行；此處不以 mock 代替 E2E，也不使用 allow-empty 或忽略失敗選項。
