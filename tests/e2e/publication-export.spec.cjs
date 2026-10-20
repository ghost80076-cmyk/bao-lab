const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const row=id=>({id,pr_number:id+500,work_id:'work-'+id,author_id:'writer',published_version:1,status:'pending_review',submitted_at:'2026-10-20 00:00:00',snapshot_json:'PRIVATE_PROMPT',admin_token:'PRIVATE_CREDENTIAL'});
test('admin downloads complete metadata and refuses failed partial export',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let failSecond=false,exportCalls=0;const methods=[];
 await page.route('https://api.yorubay.com/**',route=>{
  const request=route.request(),url=new URL(request.url());methods.push(request.method());
  let body={};
  if(url.pathname==='/admin/players')body={players:[]};
  if(url.pathname==='/admin/characters/license-submissions'){
   exportCalls++;expect(request.headers().authorization).toBe('Bearer fixture-admin-token');
   const after=Number(url.searchParams.get('after_id'));
   if(after&&failSecond)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'PRIVATE_BACKEND_ERROR'})});
   if(after)expect(url.searchParams.get('as_of_id')).toBe('101');
   body={schema_version:1,rows:after?[row(101)]:Array.from({length:100},(_,i)=>row(i+1)),as_of_id:101,has_more:!after,next_after_id:after?null:100,captured_at:'2026-10-20T00:00:00.000Z'};
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('./admin-wallet.html');
 await page.getByText('投稿紀錄核對',{exact:true}).click();
 await page.getByRole('button',{name:'下載投稿核對資料'}).click();
 await expect(page.locator('#publication-export-message')).toContainText('請先完成管理員驗證');expect(exportCalls).toBe(0);
 await page.locator('#admin-token').fill('fixture-admin-token');await page.locator('#connect').click();
 await expect(page.locator('#connect-message')).toContainText('管理員驗證成功');
 let downloads=0;page.on('download',()=>downloads++);
 const promise=page.waitForEvent('download');await page.locator('#publication-export').click();const file=await promise;
 const content=await fs.readFile(await file.path(),'utf8'),data=JSON.parse(content);
 expect(data.complete).toBe(true);expect(data.rows).toHaveLength(101);expect(data.as_of_id).toBe(101);
 expect(content).not.toMatch(/PRIVATE_|fixture-admin-token|snapshot_json|admin_token/);
 await expect(page.locator('#publication-export-message')).toContainText('101 筆投稿紀錄');
 failSecond=true;await page.locator('#publication-export').click();
 await expect(page.locator('#publication-export-message')).toContainText('匯出失敗，沒有產生檔案');
 await expect(page.locator('#publication-export')).toBeEnabled();expect(downloads).toBe(1);expect(exportCalls).toBe(4);
 await expect(page.locator('#publication-export-message')).not.toContainText('PRIVATE_');
 expect(methods.every(method=>method==='GET')).toBe(true);
 await page.locator('#publication-export').scrollIntoViewIfNeeded();
 await page.screenshot({path:test.info().outputPath('publication-export-mobile.png')});
});
