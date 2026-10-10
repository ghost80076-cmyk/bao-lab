# 三界導演實驗評測準備

提供 12 個案例，涵蓋慢熱關係、TRPG、勢力、求生、懸疑，以及最新玩家行動與提案／事實隔離。這些是待執行的評測材料，不是已取得的模型結果，也不代表自動導演通過上線門檻。

依 `ai-director-experiment.md`，基準與 combined state-update 需使用相同作品、相同輸入與模型設定。觀察實際狀態準確度、人物自主、因果、離場發展、節奏、安靜回合、強制事件、玩家控制權與資訊洩漏；記錄實際 tokens、延遲、呼叫次數和穩定前綴行為。案例需對應到代表性作品，不以一般情境代替完整作品實測。

`scripts/evaluate-three-realms-director.py` 接收配對的測量／人工評分 JSON，檢查案例是否完整、欄位與數值是否有效、是否有退步或關鍵錯誤、是否增加模型呼叫，以及成本／延遲是否經人工審閱。它不呼叫模型、不修改故事、不寫導演狀態，也不自動啟用 runtime。

使用：`python3 scripts/evaluate-three-realms-director.py measured-observations.json`。資料 shape 可參考同檔 `synthetic_report`，但必須用真實實測替換；`synthetic: true` 一律不能通過契約 gate。`--self-test` 只驗證資料檢查器，不能宣稱模型品質通過。未知欄位、缺漏或重複案例、NaN、負數、布林假冒數值、額外工具欄位以及重複 JSON key 均拒絕。未通過的評測輸出摘要後回傳非零退出碼。

分數與測量是外部輸入，檢查器不能驗證填報者或自然語言語意。即使契約檢查通過，仍需依實驗文件審閱實際輸出與測量記錄，再決定是否進入 runtime 實作。現階段 33、36、42 的自動功能與 172 的完整呈現 follow-up 保持未完成。
