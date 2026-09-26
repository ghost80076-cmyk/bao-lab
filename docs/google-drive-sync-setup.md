# BAO/LAB：Google Drive 跨裝置故事同步（測試版）

這個功能使用玩家自己的 Google Drive `appDataFolder`，不需要 BAO/LAB 後端。故事在雲端以一般 JSON 儲存，**尚未加密**；不會同步 AI API Key。沒有連結 Google 的玩家仍可使用本地故事庫及原本的檔案備份。

## 站長必須完成的設定

1. 使用自己的 Google 帳號進入 [Google Cloud Console](https://console.cloud.google.com/)，建立或選取 BAO/LAB 專案，啟用 **Google Drive API**。
2. 設定 Google Auth Platform 的品牌／授權畫面；測試階段加入自己的測試 Google 帳號，公開前完成適用的發布或驗證要求。
3. 建立 OAuth **Web application** Client ID；Authorized JavaScript origins 至少加入 `https://ghost80076-cmyk.github.io`。若之後改用自有網域，再新增其精確 origin。
4. 將取得的公開 **Client ID** 填入 `js/google-drive-config.js` 的 `clientId`。**不要**填入 Client Secret、Google 密碼、存取權杖或玩家的 AI API Key。
5. 部署後測試兩台不同裝置：手機連結並同步、電腦以同一個 Google 帳號連結並同步，確認故事章節／分支和狀態可恢復；兩台都改動同一故事後應顯示衝突、不覆蓋。

在完成第 4 步前，「雲端故事」面板會說明尚未設定，Google 連結按鈕停用；這是預期行為。ChatGPT 無法代替站長在其 Google Cloud 帳號建立 OAuth 憑證。

## 玩家怎麼用

在首頁頂部按「雲端故事」→「連結 Google」→授權 BAO/LAB 應用程式專用資料夾 →「立即同步」。另一台裝置以**同一 Google 帳號**完成相同步驟即可下載本機尚未存在的故事。新裝置首次載入仍需自行輸入 AI API Key。建議先備份原本的故事，再開始同步。

自動同步需由玩家自行勾選；儲存後約一分鐘合併處理，並非逐字同步，也不會在關閉網站後持續運行。授權權杖只存在目前頁面的記憶體，重新開頁或到期後須由玩家再次點擊連結。

## 目前限制與資料保護

- 同步採 **每個故事一份完整 bundle**，只上傳有變動的故事；查詢雲端清單採分頁、每次同步查一次。不包含角色卡私人收藏、玩家偏好設定、單獨的手動存檔槽或 AI API Key。
- 當兩端都有變更、首次遇到同名故事，或發現重複的雲端檔案時，保留兩端資料並停止該故事的同步。請先用完整故事備份或「裝置搬家包」保存雙方，再決定要保留哪份；目前尚無自動合併介面。
- 在故事進行中不會直接覆蓋其本機資料。從雲端下載之後，首頁的「繼續故事」會讀取恢復的故事；若目前有其他本機故事，請使用故事庫開啟下載的故事。
- 雲端 JSON **沒有端對端加密**。Google Drive API 寫入前會重新讀取版本，但不具跨裝置原子鎖；極短時間的同時寫入仍可能競爭。正式全面開放前還需兩裝置的真實 OAuth 與競爭情境驗收。
- Google Drive API 使用額度與政策可能調整，請以 [Google 官方文件](https://developers.google.com/workspace/drive/api/guides/appdata) 為準；有大量玩家後監控配額。
