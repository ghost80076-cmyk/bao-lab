(function(root) {
  'use strict';
  const button = root.document.getElementById('usage-signals-load');
  const output = root.document.getElementById('usage-signals-report');
  if (!button || !output) return;
  button.addEventListener('click', async()=>{
    if (!root.YoruBayAdmin?.isAuthenticated()) { output.textContent='請先完成管理員驗證。'; return; }
    button.disabled=true; output.textContent='正在讀取…';
    try {
      const data = await root.YoruBayAdmin.api('/admin/usage-signals', {method:'GET'});
      if (data?.schema_version !== 1 || !Array.isArray(data.rows)) throw Error('invalid_report');
      const table=root.document.createElement('table');
      const headings=['日期（UTC）','開始遊玩','曾成功回覆','曾回覆失敗','累積成功 5 次','接收批次'];
      const head=table.createTHead().insertRow();
      for (const label of headings) { const th=root.document.createElement('th'); th.textContent=label; th.scope='col'; head.appendChild(th); }
      const body=table.createTBody();
      for (const row of data.rows) {
        const tr=body.insertRow();
        for (const key of ['day','started','first_success','first_failure','five_turns','batches']) tr.insertCell().textContent=String(row[key] ?? '');
      }
      output.replaceChildren();
      const note=root.document.createElement('p');
      note.textContent=(data.enabled ? '統計接收已啟用。' : '統計接收已停用。') +
        (data.rows.length ? '僅涵蓋同意回報的分頁，非玩家人數；成功與失敗可同時出現。接收批次達每日 '+data.daily_batch_limit+' 時，當日數字可能不完整。' : '尚無資料；不能據此判定沒有人玩。');
      output.appendChild(note); if (data.rows.length) output.appendChild(table);
    } catch { output.textContent='讀取失敗，請確認管理員驗證與 Worker 部署版本後重試。'; }
    finally {button.disabled=false;}
  });
})(window);
