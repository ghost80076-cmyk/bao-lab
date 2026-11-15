const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const source=fs.readFileSync('js/storage.js','utf8').replace(/Storage\.init\(\);\s*$/,'');
const ui=fs.readFileSync('js/site-ui.js','utf8');
const render=ui.slice(ui.indexOf('    const renderSlots = () => {'),ui.indexOf('    const picker = document.getElementById("import-save-file");'));
async function harness(context){
 await context.route('**/operation-recovery*',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="slot-list"></div><div id="notice" role="alert"></div><script>
 window.App={escapeHTML:s=>s};window.notifyPlayer=t=>document.querySelector('#notice').textContent=t;window.resumeSave=()=>{};window.confirm=()=>true;
 ${route.request().url().includes('fallback')?'Object.defineProperty(window,"indexedDB",{value:undefined});':''}
 </script><script>${source}</script><script>
 window.fixture=id=>({id,label:id,characterId:'fixture',savedAt:new Date().toISOString(),config:{},chat:{messages:[]}});
 window.quota=false;const proto=Object.getPrototypeOf(localStorage),set=proto.setItem;proto.setItem=function(k,v){if(window.quota&&k===Storage.fallbackSnapshotKey)throw new DOMException('fixture quota','QuotaExceededError');return set.call(this,k,v)};
 const open=Storage._openDatabase.bind(Storage);window.openGate=new Promise(r=>window.releaseOpen=r);Storage._openDatabase=async()=>{await openGate;return open()};
 ${render}window.renderSlots=renderSlots;Storage.init();</script>`}));
}
for(const kind of ['autosave','slot'])test(`startup quota failure acknowledged by IDB cannot replay stale ${kind}`,async({context,page})=>{
 await harness(context);await page.goto('/operation-recovery');
 const result=await page.evaluate(async kind=>{
  window.quota=true;Storage._commitOperation({type:kind==='autosave'?'saveStory':'saveSlot',payload:fixture('old')});await Storage._writeQueue;
  const failed=Storage._fallbackFailures.size;window.quota=false;releaseOpen();await Storage.ready();await Storage.flush();
  const acknowledged=Storage._fallbackFailures.size;
  Storage._commitOperation(kind==='autosave'?{type:'saveStory',payload:fixture('new')}:{type:'deleteSlot',id:'old'});await Storage.flush();
  Storage._db.transaction=()=>{throw Error('fixture IDB failure')};Storage._commitOperation({type:'saveSlot',payload:fixture('unrelated')});await Storage.flush();
  return {failed,acknowledged,auto:Storage._readFallbackSnapshot().autosave?.label,slots:Storage._readFallbackSnapshot().slots.map(s=>s.id).sort()};
 },kind);
 expect(result.failed).toBe(1);expect(result.acknowledged).toBe(0);
 expect(result.slots).toEqual(['unrelated']);if(kind==='autosave')expect(result.auto).toBe('new');
 await page.reload();await page.evaluate(()=>{releaseOpen();return Storage.ready()});
 expect(await page.evaluate(()=>Storage.listSlots().map(s=>s.id))).toEqual(['unrelated']);
 if(kind==='autosave')expect(await page.evaluate(()=>Storage.loadStory().label)).toBe('new');
});
for(const kind of ['autosave','slot'])test(`commit acknowledgement retains newer failed ${kind} until recovery`,async({context,page})=>{
 await harness(context);await page.goto('/operation-recovery');
 const result=await page.evaluate(async kind=>{
  const op=label=>({type:kind==='autosave'?'saveStory':'saveSlot',payload:{...fixture(label),id:'same'}});
  quota=true;Storage._commitOperation(op('old'));await Storage._writeQueue;
  const persist=Storage._persistOperationIndexedDB.bind(Storage);let first=true;
  Storage._persistOperationIndexedDB=async operation=>{if(first){first=false;Storage._commitOperation(op('new'));quota=true;try{await Storage._persistFallbackOperations(Storage._pendingOperations.at(-1),Storage._cache)}catch{}quota=false;await persist(operation);window.afterOld=[...Storage._fallbackFailures.values()].map(e=>e.operation.payload.label);}else{throw Error('fixture abort')}};
  quota=false;releaseOpen();await Storage.ready();await Storage.flush();
  // Repeat a real fallback quota failure. Recovery must retain unrelated commits.
  Storage._commitOperation({type:'saveSlot',payload:fixture('unrelated')});await Storage.flush();quota=true;
  Storage._commitOperation(op('latest'));await Storage._writeQueue;let rejected=false;try{await Storage.flush()}catch{rejected=true}
  const retained=[...Storage._fallbackFailures.values()].map(e=>e.operation.payload.label);quota=false;
  Storage._commitOperation({type:'saveSlot',payload:fixture('trigger')});await Storage.flush();
  return {afterOld,rejected,retained};
 },kind);
 expect(result).toEqual({afterOld:['new'],rejected:true,retained:['latest']});
 await page.reload();await page.evaluate(()=>{releaseOpen();return Storage.ready()});
 expect(await page.evaluate(kind=>kind==='autosave'?Storage.loadStory().label:Storage.getSlot('same').label,kind)).toBe('latest');
 expect(await page.evaluate(()=>Storage.listSlots().map(s=>s.id))).toEqual(expect.arrayContaining(['unrelated','trigger']));
});
for(const width of [320,390,1280])for(const mode of ['indexeddb','owner','blocked','quota'])test(`slot deletion ${mode} at ${width}px reports durable outcome`,async({context,page})=>{
 await harness(context);await page.setViewportSize({width,height:800});await page.goto('/operation-recovery'+(mode==='indexeddb'?'':'?fallback'));
 await page.evaluate(async()=>{releaseOpen();await Storage.ready();Storage._commitOperation({type:'saveSlot',payload:fixture('kept')});await Storage.flush()});
 let actor=page;
 if(mode==='blocked'){actor=await context.newPage();await actor.setViewportSize({width,height:800});await actor.goto('/operation-recovery?fallback');await actor.evaluate(()=>{releaseOpen();return Storage.ready()});}
 await actor.evaluate(mode=>{quota=mode==='quota';renderSlots()},mode);
 const button=actor.locator('[data-delete-slot]');await button.focus();await button.click();
 if(mode==='blocked'||mode==='quota'){
  await expect(actor.locator('#notice')).toContainText('刪除尚未儲存');
  await expect(actor.locator('#slot-list')).toContainText('刪除待完成');
  expect(await actor.evaluate(()=>Storage._readFallbackSnapshot().slots.map(s=>s.id))).toEqual(['kept']);
  expect(await actor.evaluate(()=>Storage._fallbackFailures.size)).toBe(1);
  if(mode==='blocked'){await expect(actor.locator('#notice')).toContainText('另一個分頁');await page.close();await expect.poll(()=>actor.evaluate(async()=>(await navigator.locks.query()).held.some(l=>l.name===Storage.fallbackWriterLockName))).toBe(false);}
  else{await actor.evaluate(async()=>{quota=false;Storage._commitOperation({type:'saveSlot',payload:fixture('unrelated')});await Storage.flush()});}
 }else{await expect(actor.locator('#notice')).toContainText('刪除已確認儲存');await expect(actor.locator('[data-delete-slot]')).toHaveCount(0);}
 await actor.reload();await actor.evaluate(()=>{releaseOpen();return Storage.ready()});
 expect(await actor.evaluate(()=>Storage.listSlots().map(s=>s.id))).toEqual(mode==='blocked'?['kept']:mode==='quota'?['unrelated']:[]);
 expect(await actor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('native IDB abort cannot acknowledge an uncommitted operation',async({context,page})=>{
 await harness(context);await page.goto('/operation-recovery');
 const result=await page.evaluate(async()=>{
  quota=true;Storage._commitOperation({type:'saveStory',payload:fixture('recoverable')});await Storage._writeQueue;
  const persist=Storage._persistOperationIndexedDB.bind(Storage);Storage._persistOperationIndexedDB=operation=>{
   const transaction=Storage._transaction.bind(Storage);
   Storage._transaction=(mode,action)=>transaction(mode,(store,tx,abort)=>{action(store,tx,abort);tx.abort()});
   return persist(operation);
  };
  releaseOpen();await Storage.ready();await Storage._writeQueue;
  let rejected=false;try{await Storage.flush()}catch{rejected=true}
  const pending=[...Storage._fallbackFailures.values()].filter(e=>e.operation).map(e=>e.operation.payload.label);
  quota=false;Storage._commitOperation({type:'saveSlot',payload:fixture('unrelated')});await Storage.flush();return {rejected,pending};
 });
 expect(result).toEqual({rejected:true,pending:['recoverable']});
 await page.reload();await page.evaluate(()=>{releaseOpen();return Storage.ready()});
 expect(await page.evaluate(()=>Storage.loadStory().label)).toBe('recoverable');
 expect(await page.evaluate(()=>Storage.listSlots().map(s=>s.id))).toEqual(['unrelated']);
});

test('deletion stays visible and duplicate clicks are disabled until durable settlement',async({context,page})=>{
 await harness(context);await page.goto('/operation-recovery');
 await page.evaluate(async()=>{releaseOpen();await Storage.ready();Storage._commitOperation({type:'saveSlot',payload:fixture('kept')});await Storage.flush();
  const persist=Storage._persistOperationIndexedDB.bind(Storage);Storage._persistOperationIndexedDB=async operation=>{window.pendingCommit=true;await new Promise(r=>window.releaseCommit=r);return persist(operation)};renderSlots();});
 await page.locator('[data-delete-slot]').focus();await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>Boolean(window.pendingCommit))).toBe(true);
 await expect(page.locator('[data-delete-slot]')).toBeDisabled();await expect(page.locator('[data-delete-slot]')).toContainText('正在儲存刪除');
 await page.evaluate(()=>renderSlots()); // Listing again cannot hide an uncommitted deletion.
 await expect(page.locator('#slot-list')).toContainText('kept');await expect(page.locator('#notice')).toBeEmpty();
 await page.evaluate(()=>releaseCommit());await expect(page.locator('#notice')).toContainText('刪除已確認儲存');
 await expect(page.locator('#slot-list')).toBeFocused();
 await page.reload();await page.evaluate(()=>{releaseOpen();return Storage.ready()});expect(await page.evaluate(()=>Storage.listSlots())).toEqual([]);
});
