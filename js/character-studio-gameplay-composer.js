/* First-party visual editor. The studio's raw gameplay_ui remains the only draft. */
(() => {
  'use strict';
  const Studio=window.BAOCharacterStudio, Core=window.BAOGameplayUICore;
  const Edit=window.BAOGameplayUIComposerEditCore, Diagnose=window.BAOGameplayUIComposerCore;
  const root=document.getElementById('studio-gameplay-composer');
  if(!Studio||!Core||!Edit||!Diagnose||!root)return;
  const names={meters:'狀態條',stats:'數值資訊',list:'清單',actions:'行動按鈕',cards:'資料卡',tabs:'分頁',location_archive:'地點檔案',timeline:'歷程'};
  let selected=null, dragging=null, client=null, redrawTimer=0, previewTimer=0;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn,label)=>{const n=el('button',text,'secondary');n.type='button';if(label)n.setAttribute('aria-label',label);n.addEventListener('click',fn);return n;};
  const pathKey=p=>JSON.stringify(p);
  const get=(ui,path)=>path?.reduce((v,k)=>v?.[k],ui);
  const tell=message=>{const node=root.querySelector('[data-composer-message]');if(node.textContent!==message)node.textContent=message;};
  const isNarrow=()=>window.matchMedia('(max-width:1100px)').matches;
  root.innerHTML=`<header class="composer-heading"><div><h3>互動 UI 編排器</h3><p class="note">用面板與組件組合故事介面。修改後請儲存草稿。</p></div><button type="button" class="secondary" data-composer-enable>啟用互動 UI</button></header>
    <p class="note" data-composer-message role="status" aria-live="polite"></p>
    <div data-composer-workspace hidden>
      <nav class="composer-pane-nav" aria-label="編排區域"><button type="button" data-show-pane="structure">結構</button><button type="button" data-show-pane="fields">欄位</button><button type="button" data-show-pane="preview">預覽</button></nav>
      <div class="composer-grid" data-current-pane="structure">
        <section data-composer-pane="structure" aria-label="面板結構"><div class="composer-pane-heading"><h4>面板結構</h4><button type="button" class="secondary" data-add-panel>新增面板</button></div><p class="note" data-panel-count></p><div data-composer-tree></div></section>
        <section data-composer-pane="fields" aria-label="欄位設定"><h4 tabindex="-1" data-field-heading>欄位設定</h4><div data-composer-fields></div></section>
        <section data-composer-pane="preview" aria-label="即時預覽"><h4>即時預覽</h4><label>預覽寬度<select data-preview-width><option value="fit" selected>適合目前預覽區</option><option value="390">手機 · 390px</option><option value="900">平板 · 900px</option><option value="1280">桌機 · 1280px</option><option value="1440">寬桌機 · 1440px</option></select></label><p class="note">使用作品初始資料；缺少的數值以範例補足。預覽不會改動作品或故事。固定寬度超出時可在預覽區左右捲動。</p><button type="button" class="secondary" data-preview-reset>重設預覽資料</button><div class="composer-preview-scroll"><iframe title="互動 UI 即時預覽" data-composer-preview loading="lazy"></iframe></div></section>
      </div>
      <details class="composer-diagnostics"><summary data-diagnostic-count>設定檢查</summary><ul data-composer-diagnostics></ul></details>
      <details class="composer-help"><summary>怎麼開始？</summary><p>先新增面板，再加入狀態條、數值、清單或行動按鈕。狀態來源可選時間、地點、事件、人物，或填入世界模組欄位；例如 player.hp 會連到 modules.player.hp。</p><p>拖曳項目可排序，也可用上移／下移，或在結構按鈕上按 Alt＋方向鍵。尚未填好的區塊可以先儲存草稿；預覽會略過無效內容，設定檢查會列出原因。</p><p>原有資料卡、分頁、地點檔案與歷程會完整保留，可排序；此階段先提供四種基本組件的欄位編輯。購買／消耗效果請使用既有的操作按鈕建立器。</p></details>
    </div>`;
  const q=s=>root.querySelector(s), workspace=q('[data-composer-workspace]');
  function pane(name){q('.composer-grid').dataset.currentPane=name;root.querySelectorAll('[data-show-pane]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.showPane===name)));if(name==='preview'&&client)requestAnimationFrame(syncViewport);}
  root.querySelectorAll('[data-show-pane]').forEach(b=>b.addEventListener('click',()=>pane(b.dataset.showPane)));
  pane('structure');
  function execute(command,{refresh=true,focus=false}={}){
    try{
      const result=Edit.apply(Studio.getGameplayUI(),command,Core);
      Studio.setGameplayUI(result.ui);
      selected=result.selection?.length>4?result.selection.slice(0,4):result.selection;
      if(refresh)draw();else updatePreview();
      tell('已更新互動 UI，請儲存草稿。');
      if(focus){
        const target=q('[data-composer-selected="true"]');
        const fallback=q('[data-field-heading]');
        (target?.getClientRects().length?target:fallback.getClientRects().length?fallback:q('[data-add-panel]'))?.focus({preventScroll:true});
      }
      return true;
    }catch(error){tell(error.message);return false;}
  }
  q('[data-composer-enable]').addEventListener('click',()=>{if(execute({type:'enable'})){pane('structure');const add=q('[data-add-panel]');add.scrollIntoView({block:'nearest',behavior:'instant'});add.focus({preventScroll:true});}});
  q('[data-add-panel]').addEventListener('click',()=>execute({type:'add-panel'},{focus:true}));
  function mutationTools(path,list,index){
    const tools=el('div',undefined,'composer-node-tools');
    for(const [text,type,value] of [['上移','move',index-1],['下移','move',index+1],['複製','copy'],['刪除','remove']]){
      const b=button(text,()=>{
        if(type==='remove'){
          const ui=Studio.getGameplayUI(), node=get(ui,path);
          const ref=path.length===2&&ui.layout&&Object.values(ui.layout).includes(node.id);
          if(!window.confirm(ref?'刪除這個面板？版面對它的引用也會清除。':'刪除這個項目？請先確認已備份需要的內容。'))return;
        }
        execute({type,path,to:value},{focus:true});
      });
      b.disabled=type==='move'&&(value<0||value>=list.length)||type==='copy'&&list.length>=(path.length===2?Core.MAX_PANELS:path.length===4?Core.MAX_SECTIONS:Core.MAX_ITEMS);
      tools.append(b);
    }
    return tools;
  }
  function treeRow(node,path,list,index){
    const row=el('div',undefined,'composer-tree-row');row.dataset.nodePath=pathKey(path);
    const chosen=pathKey(selected)===pathKey(path);
    const text=path.length===2?(node.label||node.id||'未命名面板'):(node.title||names[node.type]||'區塊');
    const choose=button(text,()=>{selected=path;drawFields();drawTree();updatePreview();if(isNarrow()){pane('fields');q('[data-field-heading]').focus();}},'選擇'+(path.length===2?'面板：':'區塊：')+text);
    choose.dataset.composerSelected=String(chosen);choose.setAttribute('aria-pressed',String(chosen));
    choose.addEventListener('keydown',event=>{
      if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();const to=index+(event.key==='Arro…2647 tokens truncated…'範例地點');return state;
  }
  function syncViewport(){
    if(!client)return;
    const value=q('[data-preview-width]').value;
    client.setViewport(value==='fit'?Math.min(390,q('.composer-preview-scroll').clientWidth||390):Number(value),640);
  }
  function ensurePreview(){
    if(client)return;
    const frame=q('[data-composer-preview]');
    client=window.BAOGameplayUIPreviewClient.createPreviewClient(frame);
    client.on('error',result=>tell('無法預覽：'+(result.reason==='payload_too_large'?'資料超過預覽大小上限，請縮小範例資料。':'請先修正設定格式。')));
    frame.src='gameplay-ui-preview.html';frame.style.height='640px';
    client.on('ready',()=>updatePreview());
    q('[data-preview-width]').addEventListener('change',syncViewport);
    q('[data-preview-reset]').addEventListener('click',()=>{client.reset();tell('預覽資料已重設，作品初始資料保持不變。');});
    syncViewport();
    new ResizeObserver(()=>{if(q('[data-preview-width]').value==='fit')syncViewport();}).observe(q('.composer-preview-scroll'));
  }
  function updatePreview(){
    clearTimeout(previewTimer);
    previewTimer=setTimeout(()=>{
      const ui=Studio.getGameplayUI();if(!ui)return;
      const report=Diagnose.analyzeDraft(ui,Core), list=q('[data-composer-diagnostics]');list.replaceChildren();
      const problems=report.nodes.filter(n=>n.status!=='ok');
      q('[data-diagnostic-count]').textContent=problems.length?`設定檢查 · ${problems.length} 個提醒`:'設定檢查 · 可以預覽';
      problems.forEach(problem=>{const path=problem.path.map(v=>({panels:'面板',sections:'區塊',items:'項目',builder:'初始設定',attributes:'屬性',fields:'欄位',choice_groups:'選項群組',theme:'主題',layout:'布局',tabs:'分頁'}[v]|| (typeof v==='number'?v+1:v))).join(' › ');list.append(el('li',(path||'整體設定')+'：'+(reasons[problem.status]||'請檢查此設定。')));});
      if(!problems.length)list.append(el('li','目前沒有發現會被略過的設定。'));
      ensurePreview();
      let card;try{card=Studio.getGameplayPreviewData();}catch(error){tell('無法預覽：'+error.message);return;}
      client.render(ui,previewState(card,report.schema),ui.panels?.[selected?.[1]]?.id||'');
    },180);
  }
  function draw(){
    const ui=Studio.getGameplayUI();const enabled=Boolean(ui)&&ui.enabled!==false;workspace.hidden=!enabled;q('[data-composer-enable]').hidden=enabled;
    if(!enabled){tell('尚未啟用。一般閱讀作品不需要互動 UI。');return;}
    if(selected&&!get(ui,selected))selected=null;
    if(!selected&&ui.panels?.length)selected=['panels',0];
    tell('已載入互動 UI。選擇面板或區塊開始編排。');
    drawTree();drawFields();updatePreview();
  }
  window.addEventListener('bao:studio-gameplay-loaded',()=>{selected=null;draw();});
  window.addEventListener('bao:studio-gameplay-theme-changed',updatePreview);

  window.BAOCharacterStudioGameplayComposer=Object.freeze({refresh:draw});
  draw();
})();
