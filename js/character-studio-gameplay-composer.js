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
        event.preventDefault();const to=index+(event.key==='ArrowUp'?-1:1);
        if(to>=0&&to<list.length)execute({type:'move',path,to},{focus:true});
      }
    });
    const handle=button('排序',()=>{},'拖曳排序：'+text);handle.className='secondary composer-drag-handle';handle.draggable=true;
    handle.addEventListener('dragstart',event=>{dragging=path;event.dataTransfer.setData('text/plain',pathKey(path));event.dataTransfer.effectAllowed='move';});
    row.addEventListener('dragover',event=>{if(dragging&&pathKey(dragging.slice(0,-1))===pathKey(path.slice(0,-1)))event.preventDefault();});
    row.addEventListener('drop',event=>{event.preventDefault();if(dragging&&pathKey(dragging.slice(0,-1))===pathKey(path.slice(0,-1)))execute({type:'move',path:dragging,to:index},{focus:true});dragging=null;});
    row.addEventListener('dragend',()=>{dragging=null;});
    const heading=el('div',undefined,'composer-tree-heading');heading.append(handle,choose);
    row.append(heading,mutationTools(path,list,index));return row;
  }
  function drawTree(){
    const ui=Studio.getGameplayUI(), host=q('[data-composer-tree]');host.replaceChildren();
    const panels=Array.isArray(ui?.panels)?ui.panels:[];
    q('[data-panel-count]').textContent=`${panels.length} / ${Core.MAX_PANELS} 個面板`;
    q('[data-add-panel]').disabled=!Array.isArray(ui?.panels)||panels.length>=Core.MAX_PANELS;
    if(!panels.length)host.append(el('p','尚未建立面板。新增一個面板，再加入組件。','note'));
    panels.forEach((panel,i)=>{
      if(!panel||typeof panel!=='object'){host.append(el('p',`面板 ${i+1} 格式不完整，請先備份並修正來源資料。`,'note'));return;}
      const group=el('div',undefined,'composer-tree-group');group.append(treeRow(panel,['panels',i],panels,i));
      (Array.isArray(panel.sections)?panel.sections:[]).forEach((section,j)=>{
        if(section&&typeof section==='object')group.append(treeRow(section,['panels',i,'sections',j],panel.sections,j));
      });host.append(group);
    });
  }
  function field(host,label,value,onInput,options={}){
    const wrap=el('label',label);const control=el(options.multiline?'textarea':'input');
    if(!options.multiline)control.type=options.number?'number':'text';
    if(options.max)control.maxLength=options.max;
    control.value=value??'';
    control.addEventListener(options.onChange?'change':'input',()=>onInput(options.number?(control.value===''?undefined:Number(control.value)):control.value));
    wrap.append(control);host.append(wrap);return control;
  }
  function bind(host,label,path,key,options={}){
    const node=get(Studio.getGameplayUI(),path);
    return field(host,label,node?.[key],value=>{
      const ok=execute({type:'set',path,key,value},{refresh:false});
      if(ok){clearTimeout(redrawTimer);redrawTimer=setTimeout(drawTree,200);}
    },options);
  }
  function pathField(host,label,path,key,optional=false){
    const value=String(get(Studio.getGameplayUI(),path)?.[key]||'');
    const wrap=el('div',undefined,'composer-path-field'), sourceLabel=el('label',label), select=el('select');
    for(const [v,t] of [...(optional?[['','固定最大值']]:[]),['time','時間'],['location','地點'],['events','事件'],['npcs','人物'],['modules','世界模組']]){
      const option=el('option',t);option.value=v;select.append(option);
    }
    select.value=value.startsWith('modules.')||value&&!['time','location','events','npcs'].includes(value)?'modules':(value|| (optional?'':'modules'));
    select.setAttribute('aria-label',label);sourceLabel.append(select);wrap.append(sourceLabel);
    const suffixLabel=el('label',label+'的模組與欄位（例：player.hp）'), suffix=el('input');suffix.type='text';suffix.value=value.startsWith('modules.')?value.slice(8):(!Core.isDisplayPath(value)?value:'');suffixLabel.append(suffix);wrap.append(suffixLabel);host.append(wrap);
    const sync=()=>{
      suffixLabel.hidden=select.value!=='modules';
      const next=select.value==='modules'?'modules.'+suffix.value.trim():select.value;
      const valid=optional&&!next||Core.isDisplayPath(next);suffix.setAttribute('aria-invalid',String(!valid));
      execute({type:'set',path,key,value:next||undefined},{refresh:false});
    };
    suffixLabel.hidden=select.value!=='modules';suffix.setAttribute('aria-invalid',String(Boolean(value)&&!Core.isDisplayPath(value)));
    select.addEventListener('change',sync);suffix.addEventListener('input',sync);
  }
  function drawFields(){
    const host=q('[data-composer-fields]');host.replaceChildren();
    const ui=Studio.getGameplayUI(), node=get(ui,selected);
    if(!node){host.append(el('p','先在結構區選擇面板或區塊。','note'));return;}
    if(selected.length===2){
      bind(host,'面板名稱',selected,'label',{max:60});
      bind(host,'面板 ID',selected,'id',{onChange:true,max:40});
      const controls=el('div',undefined,'composer-add-section');const label=el('label','加入組件'), select=el('select');select.setAttribute('aria-label','加入組件');
      for(const type of Edit.TYPES){const option=el('option',names[type]);option.value=type;select.append(option);}label.append(select);controls.append(label);
      const add=button('新增區塊',()=>{execute({type:'add-section',path:selected,sectionType:select.value},{focus:true});if(isNarrow())pane('fields');});
      add.disabled=!Array.isArray(node.sections)||node.sections.length>=Core.MAX_SECTIONS;
      controls.append(add,el('p',`${node.sections?.length||0} / ${Core.MAX_SECTIONS} 個區塊`,'note'));host.append(controls);return;
    }
    bind(host,'區塊標題',selected,'title',{max:60});
    if(!Edit.TYPES.includes(node.type)){host.append(el('p','這個組件的原始設定完整保留。目前可排序、複製與刪除，專用欄位編輯將在後續版本提供。','note'));return;}
    if(node.type==='list'){
      pathField(host,'清單來源',selected,'path');bind(host,'顯示筆數（1～30）',selected,'limit',{number:true});bind(host,'沒有資料時顯示',selected,'empty',{max:120});return;
    }
    const items=Array.isArray(node.items)?node.items:[];
    const add=button('新增項目',()=>execute({type:'add-item',path:selected},{focus:true}));add.disabled=!Array.isArray(node.items)||items.length>=Core.MAX_ITEMS;
    host.append(el('p',`${items.length} / ${Core.MAX_ITEMS} 個項目`,'note'),add);
    items.forEach((entry,i)=>{
      if(!entry||typeof entry!=='object'){host.append(el('p',`項目 ${i+1} 格式不完整，原始資料保留。`,'note'));return;}
      const path=selected.concat('items',i), section=el('fieldset',undefined,'composer-item');section.append(el('legend',`項目 ${i+1}`));
      bind(section,'顯示名稱',path,'label',{max:60});
      if(node.type==='meters'){
        pathField(section,'數值來源',path,'value_path');pathField(section,'最大值來源',path,'max_path',true);
        bind(section,'最小值',path,'min',{number:true});bind(section,'固定最大值',path,'max',{number:true});bind(section,'單位',path,'suffix',{max:20});
      }else if(node.type==='stats'){
        pathField(section,'資料來源',path,'path');bind(section,'單位',path,'suffix',{max:20});
      }else{
        bind(section,'點擊後填入的行動',path,'draft',{multiline:true,max:500});bind(section,'提示文字',path,'hint',{max:120});
        if(entry.effect)section.append(el('p','此按鈕有購買／消耗效果，修改文字會保留效果。請用操作按鈕建立器調整交易內容。','note'));
      }
      section.append(mutationTools(path,items,i));host.append(section);
    });
  }
  const reasons={duplicate:'識別碼重複，預覽將略過此項目。',incomplete:'設定尚未完成或來源無效，預覽暫時略過。',over_limit:'已超過平台上限，請刪減項目。',trimmed:'部分資料會被平台修正或裁切，請檢查。',unresolved:'版面引用的面板不存在或重複。',invalid:'設定值無效，預覽將使用平台預設。'};
  function previewState(card,schema){
    const state={};
    for(const key of ['time','location','events','npcs','modules'])if(card.initial_state?.[key]!==undefined)state[key]=structuredClone(card.initial_state[key]);
    state.modules ||= {};state.events ||= [];
    state.moduleDefinitions=(Array.isArray(card.world_modules)?card.world_modules:[])
      .filter(def=>def&&typeof def==='object'&&typeof def.id==='string')
      .map(({id,kind,enabled})=>({id,...(typeof kind==='string'?{kind}:{}),enabled:enabled!==false}));
    const seed=(path,value)=>{if(!path||Core.getPath(state,path)!==undefined)return;if(path.startsWith('modules.'))Core.setPath(state,path,value);else if(['time','location','events','npcs'].includes(path))state[path]=value;};
    const visit=sections=>(sections||[]).forEach(section=>{
      if(section.type==='tabs'){section.tabs.forEach(tab=>visit(tab.sections));return;}
      if(section.type==='meters')section.items.forEach(item=>{seed(item.value_path,25);if(item.max_path)seed(item.max_path,100);});
      else if(section.type==='stats')section.items.forEach(item=>seed(item.path,'範例資料'));
      else if(['list','cards'].includes(section.type))seed(section.path,[{id:'sample',name:'範例項目',quantity:1}]);
    });
    (schema?.panels||[]).forEach(panel=>visit(panel.sections));seed('time','範例夜晚');seed('location','範例地點');return state;
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
