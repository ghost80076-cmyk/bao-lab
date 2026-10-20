(function(root) {
  'use strict';
  const safe = value => Number.isSafeInteger(value) && value >= 0;
  const fields = ['id','pr_number','work_id','author_id','published_version','status','submitted_at'];
  async function collect(api, { pageSize = 100, maxPages = 100 } = {}) {
    if (!safe(pageSize) || pageSize < 1 || pageSize > 200 || !safe(maxPages) || maxPages < 1 || maxPages > 1000) throw Error('invalid_export_options');
    let after = 0, bound = null, captured = null; const rows = [];
    for (let i = 0; i < maxPages; i++) {
      const params = new URLSearchParams({limit:String(pageSize),after_id:String(after)});
      if (bound !== null) params.set('as_of_id',String(bound));
      const page = await api('/admin/characters/license-submissions?' + params, { method:'GET' });
      if (page?.schema_version !== 1 || !Array.isArray(page.rows) || page.rows.length > pageSize || !safe(page.as_of_id) || typeof page.has_more !== 'boolean' ||
          (typeof page.captured_at !== 'string' || page.captured_at.length > 100 || !Number.isFinite(Date.parse(page.captured_at))) || (bound !== null && page.as_of_id !== bound)) throw Error('invalid_export_page');
      bound = page.as_of_id; captured ||= page.captured_at;
      for (const row of page.rows) {
        if (!safe(row?.id) || row.id <= after || row.id > bound || !safe(row.pr_number) || row.pr_number < 1 ||
            typeof row.work_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,179}$/i.test(row.work_id) ||
            typeof row.author_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(row.author_id) ||
            !safe(row.published_version) || row.published_version < 1 || typeof row.status !== 'string' || !row.status.trim() || row.status.length > 64 ||
            typeof row.submitted_at !== 'string' || row.submitted_at.length > 100) throw Error('invalid_export_page');
        rows.push(Object.fromEntries(fields.map(key=>[key,row[key]]))); after = row.id;
      }
      if (!page.has_more) {
        if (page.next_after_id !== null) throw Error('invalid_export_page');
        return {schema_version:1,scope:'publication_submission_metadata',complete:true,as_of_id:bound,captured_at:captured,
          consistency:'Bounded ID range; paginated reads are not a transactional database snapshot.',rows};
      }
      if (!page.rows.length || page.next_after_id !== after) throw Error('invalid_export_page');
    }
    throw Error('export_page_limit');
  }
  if (typeof module === 'object' && module.exports) module.exports = { collect };
  if (!root?.document) return;
  const button=root.document.getElementById('publication-export'),message=root.document.getElementById('publication-export-message');
  if (!button || !message) return;
  button.addEventListener('click', async()=>{
    if (!root.YoruBayAdmin?.isAuthenticated()) { message.textContent='請先完成管理員驗證。'; return; }
    button.disabled=true; message.textContent='正在讀取投稿紀錄…';
    try {
      const result=await collect((...args)=>root.YoruBayAdmin.api(...args));
      const blob=new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=root.document.createElement('a');
      link.href=url; link.download='yorubay-publication-submissions-'+Date.now()+'.json'; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      message.textContent='已匯出 '+result.rows.length+' 筆投稿紀錄。這是分頁讀取的核對資料，並未更改發布狀態。';
    } catch(error) {
      const code=String(error?.message||'');
      message.textContent=code==='publication_submissions_not_initialized'?'目前尚未建立投稿紀錄表，沒有產生匯出檔。':
        code==='export_page_limit'?'紀錄超過本次匯出上限，沒有產生不完整檔案。':
        /not_found|HTTP 404/.test(code)?'伺服器尚未提供投稿匯出，請確認部署版本後重試。':
        '投稿紀錄匯出失敗，沒有產生檔案；請確認管理員驗證與連線後重試。';
    } finally {button.disabled=false;}
  });
})(typeof window !== 'undefined' ? window : null);
