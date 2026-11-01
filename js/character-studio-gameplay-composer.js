/* First-party visual editor. The studio's raw gameplay_ui remains the only draft. */
(() => {
  'use strict';
  const Studio=window.BAOCharacterStudio, Core=window.BAOGameplayUICore;
  const Edit=window.BAOGameplayUIComposerEditCore, Diagnose=window.BAOGameplayUIComposerCore;
  const root=document.getElementById('studio-gameplay-composer');
  if(!Studio||!Core||!Edit||!Diagnose||!root)return;
  const names={meters:'狀態條',stats:'數值資訊',list:'清單',actions:'行動按鈕',cards:'資料卡',tabs:'分頁',location_archive:'地點檔案',timeline:'歷程'};
  let selected=null, dragging=null, client=null, redrawTimer=0, previewTimer=0, sampleOverrides={}, previewValueKey="";
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
        <section data-composer-pane="structure" aria-label="面板結構"><div class="composer-pane-heading"><h4>面板結構</h4><button type="button" class="secondary" data-add-panel>新增面板</button></div><p class="note" data-panel-count></p><details class="composer-layout"><summary>版面設定</summary><div data-composer-layout></div></details><div data-composer-tree></div></section>
        <section data-composer-pane="fields" aria-label="欄位設定"><h4 tabindex="-1" data-field-heading>欄位設定</h4><div data-composer-fields></div></section>
        <section data-composer-pane="preview" aria-label="即時預覽"><h4>即時預覽</h4><label>預覽寬度<select data-preview-width><option value="fit" selected>適合目前預覽區</option><option value="390">手機 · 390px</option><option value="900">平板 · 900px</option><option value="1280">桌機 · 1280px</option><option value="1440">寬桌機 · 1440px</option></select></label><p class="note">使用作品初始資料；缺少的數值以範例補足。預覽不會改動作品或故事。固定寬度超出時可在預覽區左右捲動。</p><button type="button" class="secondary" data-preview-reset>重設預覽資料</button><p class="note" data-preview-stage></p><details><summary>預覽測試值</summary><div data-preview-values></div></details><div class="composer-preview-scroll"><iframe title="互動 UI 即時預覽" data-composer-preview loading="lazy"></iframe></div></section>
      </div>
      <details class="composer-diagnostics"><summary data-diagnostic-count>設定檢查</summary><ul data-composer-diagnostics></ul></details>
      <details class="composer-help"><summary>怎麼開始？</summary><p>先新增面板，再加入狀態條、數值、清單或行動按鈕。狀態來源可選時間、地點、事件、人物，或填入世界模組欄位；例如 player.hp 會連到 modules.player.hp。</p><p>拖曳項目可排序，也可用上移／下移，或在結構按鈕上按 Alt＋方向鍵。尚未填好的區塊可以先儲存草稿；預覽會略過無效內容，設定檢查會列出原因。</p><p>八種原生組件均可編輯。分頁內不能再放分頁；版面設定使用現有面板 ID。預覽一次呈現一個面板，多欄舞臺需要另外到正式遊玩驗收，地點場景圖不在此載入。</p></details>
    </div>`;
  const q=s=>root.querySelector(s), workspace=q('[data-composer-workspace]');
  function pane(name){q('.composer-grid').dataset.currentPane=name;root.querySelectorAll('[data-show-pane]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.showPane===name)));if(name==='preview'&&client)requestAnimationFrame(syncViewport);}
  root.querySelectorAll('[data-show-pane]').forEach(b=>b.addEventListener('click',()=>pane(b.dataset.showPane)));
  pane('structure');
  function execute(command,{refresh=true,focus=false}={}){
    try{
      const result=Edit.apply(Studio.getGameplayUI(),command,Core);
      Studio.setGameplayUI(result.ui);
      selected=result.selection?.at(-2)==='items'?result.selection.slice(0,-2):result.selection;
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
      b.disabled=type==='move'&&(value<0||value>=list.length)||type==='copy'&&list.length>=(path.length===2?Core.MAX_PANELS:path.at(-2)==='tabs'?Core.MAX_TABS:path.at(-2)==='sections'?Core.MAX_SECTIONS:Core.MAX_ITEMS);
      tools.append(b);
    }
    return tools;
  }
  function treeRow(node,path,list,index){
    const row=el('div',undefined,'composer-tree-row');row.dataset.nodePath=pathKey(path);
    const chosen=pathKey(selected)===pathKey(path);
    const text=path.length===2?(node.label||node.id||'未命名面板'):(path.at(-2)==='tabs'?(node.label||node.id||'分頁'):(node.title||names[node.type]||'區塊'));
    const choose=button(text,()=>{selected=path;drawFields();drawTree();updatePreview();if(isNarrow()){pane('fields');q('[data-field-heading]').focus();}},'選擇'+(path.length===2?'面板：':path.at(-2)==='tabs'?'分頁：':'區塊：')+text);
    row.setAttribute('role','group');row.setAttribute('aria-label',(path.length===2?'面板 ':path.at(-2)==='tabs'?'分頁 ':'區塊 ')+text);
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
    drawLayout(ui);
    const panels=Array.isArray(ui?.panels)?ui.panels:[];
    q('[data-panel-count]').textContent=`${panels.length} / ${Core.MAX_PANELS} 個面板`;
    q('[data-add-panel]').disabled=!Array.isArray(ui?.panels)||panels.length>=Core.MAX_PANELS;
    if(!panels.length)host.append(el('p','尚未建立面板。新增一個面板，再加入組件。','note'));
    panels.forEach((panel,i)=>{
      if(!panel||typeof panel!=='object'){host.append(el('p',`面板 ${i+1} 格式不完整，請先備份並修正來源資料。`,'note'));return;}
      const group=el('div',undefined,'composer-tree-group');group.append(treeRow(panel,['panels',i],panels,i));
      const renderSections=(sections,base)=> (Array.isArray(sections)?sections:[]).forEach((section,j)=>{
        if(!section||typeof section!=='object')return;
        const path=base.concat(j);group.append(treeRow(section,path,sections,j));
        if(section.type==='tabs'&&path.length===4)(Array.isArray(section.tabs)?section.tabs:[]).forEach((tab,t)=>{
          if(!tab||typeof tab!=='object')return;
          const tp=path.concat('tabs',t);group.append(treeRow(tab,tp,section.tabs,t));
          renderSections(tab.sections,tp.concat('sections'));
        });
      });
      renderSections(panel.sections,['panels',i,'sections']);
      host.append(group);
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
    for(const [v,t] of [...(optional?[['',key==='max_path'?'固定最大值':'使用預設／不指定']]:[]),['time','時間'],['location','地點'],['events','事件'],['npcs','人物'],['modules','世界模組']]){
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
    if(selected.length===2||selected.at(-2)==='tabs'){
      const tab=selected.at(-2)==='tabs';
      bind(host,tab?'分頁名稱':'面板名稱',selected,'label',{max:60});
      bind(host,tab?'分頁 ID':'面板 ID',selected,'id',{onChange:true,max:40});
      const controls=el('div',undefined,'composer-add-section');const label=el('label','加入組件'), select=el('select');select.setAttribute('aria-label','加入組件');
      for(const type of Edit.TYPES.filter(type=>!tab||type!=='tabs')){const option=el('option',names[type]);option.value=type;select.append(option);}label.append(select);controls.append(label);
      const add=button('新增區塊',()=>{execute({type:'add-section',path:selected,sectionType:select.value},{focus:true});if(isNarrow())pane('fields');});
      add.disabled=!Array.isArray(node.sections)||node.sections.length>=Core.MAX_SECTIONS;
      controls.append(add,el('p',`${node.sections?.length||0} / ${Core.MAX_SECTIONS} 個區塊`,'note'));host.append(controls);return;
    }
    bind(host,'區塊標題',selected,'title',{max:60});
    if(!Edit.TYPES.includes(node.type)){host.append(el('p','這個組件的原始設定完整保留。目前可排序、複製與刪除，專用欄位編輯將在後續版本提供。','note'));return;}
    if(drawAdvancedFields(host,node))return;
    if(node.type==='list'){
      pathField(host,'清單來源',selected,'path');bind(host,'顯示筆數（1～30）',selected,'limit',{number:true});bind(host,'沒有資料時顯示',selected,'empty',{max:120});return;
    }
    const items=Array.isArray(node.items)?node.items:[];
    const add=button('新增項目',()=>execute({type:'add-item',path:selected},{focus:true}));add.disabled=(node.items!==undefined&&!Array.isArray(node.items))||items.length>=Core.MAX_ITEMS;
    host.append(el('p',`${items.length} / ${Core.MAX_ITEMS} 個項目`,'note'),add);
    items.forEach((entry,i)=>{
      if(!entry||typeof entry!=='object'){host.append(el('p',`項目 ${i+1} 格式不完整，原始資料保留。`,'note'));return;}
      const path=selected.concat('items',i), section=el('fieldset',undefined,'composer-item');section.append(el('legend',`項目 ${i+1}`));
      bind(section,'顯示名稱',path,'label',{max:60});
      if(node.type==='meters'){
        pathField(section,'數值來源',path,'value_path');pathField(section,'最大值來源',path,'max_path',true);
        bind(section,'最小值',path,'min',{number:true});bind(section,'固定最大值',path,'max',{number:true});bind(section,'單位',path,'suffix',{max:20});
      }else if(node.type==='stats'||node.type==='timeline'){
        pathField(section,'資料來源',path,'path');bind(section,'單位',path,'suffix',{max:20});
      }else{
        bind(section,'點擊後填入的行動',path,'draft',{multiline:true,max:500});bind(section,'提示文字',path,'hint',{max:120});
        drawEffect(section,path,entry);
      }
      section.append(mutationTools(path,items,i));host.append(section);
    });
  }
  function selectControl(host,label,value,options,onChange){
    const wrap=el('label',label),select=el('select');select.setAttribute('aria-label',label);
    const choices=options.map(o=>Array.isArray(o)?o:[o,o]);
    if(value&&!choices.some(([v])=>v===value)){const o=el('option','原有值（需檢查）：'+value);o.value=value;o.disabled=true;select.append(o);}
    choices.forEach(([v,t])=>{const o=el('option',t);o.value=v;select.append(o);});select.value=value||'';
    select.addEventListener('change',()=>onChange(select.value));wrap.append(select);host.append(wrap);return select;
  }
  function enumField(host,label,key,options){
    const path=selected.slice(),node=get(Studio.getGameplayUI(),path);
    selectControl(host,label,node[key]??({variant:'codex',mode:'history',scene_source:'story-gallery',scene_fit:'cover'}[key]),options,value=>{
      const paths={codex:'modules.codex',quest:'modules.quests',party:'modules.party',skill:'modules.skills'};
      if(execute({type:'set',path,key,value})&&key==='variant'&&(!node.path||Object.values(paths).includes(node.path))){
        execute({type:'set',path,key:'path',value:paths[value]});
      }
    });
  }
  function drawLayout(ui){
    const host=q('[data-composer-layout]');host.replaceChildren();
    const layout=ui?.layout&&typeof ui.layout==='object'&&!Array.isArray(ui.layout)?ui.layout:{};
    const change=(key,value)=>{
      const result=Diagnose.setLayoutField(Studio.getGameplayUI(),key,value);
      if(!result.ok){tell('版面設定無效，請先檢查原有資料。');return;}
      try{Studio.setGameplayUI(result.draft);draw();}catch(e){tell(e.message);}
    };
    selectControl(host,'版面 preset',layout.preset||'standard',Core.LAYOUT_PRESETS,value=>change('preset',value));
    const choices=[['','自動選擇'],...(ui.panels||[]).filter(p=>p&&typeof p.id==='string').map(p=>[p.id,p.label||p.id])];
    if(layout.preset==='rpg-dashboard')for(const [key,label,alias] of [['left_panel','左側面板','left'],['right_panel','右側面板','right']])selectControl(host,label,layout[key]||layout[alias],choices,v=>change(key,v));
    if(layout.preset==='terminal')selectControl(host,'主要面板',layout.primary_panel||layout.panel||layout.left_panel,choices,v=>change('primary_panel',v));
    if(layout.preset==='scene-rpg'){
      selectControl(host,'右側面板',layout.right_panel||layout.right,choices,v=>change('right_panel',v));
      selectControl(host,'場景來源',layout.scene_source||'story-gallery',Core.SCENE_SOURCES,v=>change('scene_source',v));
      selectControl(host,'場景縮放',layout.scene_fit||'cover',Core.SCENE_FITS,v=>change('scene_fit',v));
    }
  }
  function drawAdvancedFields(host,node){
    if(node.type==='cards'){
      enumField(host,'資料卡樣式','variant',Core.CARD_VARIANTS);
      pathField(host,'資料卡來源',selected,'path');bind(host,'顯示筆數（1～30）',selected,'limit',{number:true});bind(host,'沒有資料時顯示',selected,'empty',{max:120});return true;
    }
    if(node.type==='tabs'){
      const tabs=Array.isArray(node.tabs)?node.tabs:[];
      const path=selected.slice();selectControl(host,'預設分頁',node.default_tab||'',[['','第一個可用分頁'],...tabs.filter(t=>t&&typeof t.id==='string').map(t=>[t.id,t.label||t.id])],v=>execute({type:'set',path,key:'default_tab',value:v||undefined}));
      host.append(el('p',`${tabs.length} / ${Core.MAX_TABS} 個分頁`,'note'));
      const add=button('新增分頁',()=>execute({type:'add-tab',path},{focus:true}));add.disabled=!Array.isArray(node.tabs)||tabs.length>=Core.MAX_TABS;host.append(add);
      tabs.forEach((tab,i)=>{if(!tab||typeof tab!=='object')return;host.append(button('編輯分頁：'+(tab.label||tab.id),()=>{selected=path.concat('tabs',i);drawFields();drawTree();q('[data-field-heading]').focus();}));});return true;
    }
    if(node.type==='location_archive'){
      for(const [key,label] of [['time_path','時間來源'],['location_path','地點來源'],['area_path','區域來源'],['status_path','狀態來源'],['destinations_path','目的地來源']])pathField(host,label,selected,key,true);
      enumField(host,'場景來源','scene_source',Core.SCENE_SOURCES);enumField(host,'場景縮放','scene_fit',Core.SCENE_FITS);
      bind(host,'顯示筆數（1～20）',selected,'limit',{number:true});bind(host,'沒有資料時顯示',selected,'empty',{max:120});
      host.append(el('p','此處不載入作品場景圖；圖片與完整舞臺請在正式遊玩確認。','note'));return true;
    }
    if(node.type==='timeline'){
      enumField(host,'歷程模式','mode',Core.TIMELINE_MODES);
      if(node.mode!=='round_diff'){
        pathField(host,'歷程來源',selected,'path');bind(host,'顯示筆數（1～30）',selected,'limit',{number:true});bind(host,'沒有資料時顯示',selected,'empty',{max:120});return true;
      }
    }
    return false;
  }
  function effectTarget(path){return {panel:path[1],section:path[3],...(path.length===10?{tab:path[5],child:path[7]}:{}),item:path.at(-1)};}
  function effectChange(result,refresh=true){
    if(!result.ok){tell('無法修改結算效果：'+result.reason);return false;}
    try{Studio.setGameplayUI(result.draft);if(refresh){const opened=[...q('[data-composer-fields]').querySelectorAll('.composer-effect[open]')].map(e=>e.dataset.effectPath);drawFields();q('[data-composer-fields]').querySelectorAll('.composer-effect').forEach(e=>{e.open=opened.includes(e.dataset.effectPath);});}updatePreview();tell('已更新互動 UI，請儲存草稿。');return true;}catch(e){tell(e.message);return false;}
  }
  function effectPath(host,label,value,onChange){
    const wrap=el('div',undefined,'composer-path-field'),l=el('label',label+'（modules. 後的欄位）'),input=el('input');input.value=String(value||'').replace(/^modules\./,'');
    input.setAttribute('aria-invalid',String(!Core.isTargetPath(value)));input.addEventListener('input',()=>{const next='modules.'+input.value.trim();input.setAttribute('aria-invalid',String(!Core.isTargetPath(next)));onChange(next);});l.append(input);wrap.append(l);host.append(wrap);
  }
  function drawEffect(host,path,entry){
    const details=el('details',undefined,'composer-effect');details.append(el('summary','自動結算（購買／消耗）'));host.append(details);
    details.dataset.effectPath=pathKey(path);
    const target=effectTarget(path);
    for(const [part,label] of [['changes','數值變動'],['items','物品變動']]){
      const rows=Array.isArray(entry.effect?.[part])?entry.effect[part]:[];
      details.append(el('p',`${label} · ${rows.length} / ${Core.MAX_EFFECT_ENTRIES}`,'note'));
      const add=button('新增'+label,()=>effectChange(Diagnose.addEffectEntry(Studio.getGameplayUI(),target,part)));add.disabled=rows.length>=Core.MAX_EFFECT_ENTRIES;details.append(add);
      rows.forEach((row,i)=>{
        const box=el('fieldset',undefined,'composer-effect-entry');box.append(el('legend',`${label} ${i+1}`));
        if(!row||typeof row!=='object'){box.append(el('p','原有設定格式無效，可移除此筆後重建。','note'));}
        else{
          const change=(key,value)=>effectChange(Diagnose.setEffectEntryField(Studio.getGameplayUI(),target,part,i,key,value),false);
          effectPath(box,'結算來源',row.path,v=>change('path',v));
          if(part==='items'){field(box,'物品 ID',row.id,v=>change('id',v));field(box,'物品名稱',row.name,v=>change('name',v));}
          field(box,'變動量',row.delta,v=>change('delta',v),{number:true});
        }
        box.append(button('移除這筆'+label,()=>{if(window.confirm('移除此筆結算？'))effectChange(Diagnose.removeEffectEntry(Studio.getGameplayUI(),target,part,i));}));details.append(box);
      });
    }
    if(entry.effect){
      field(details,'結算事件文字',entry.effect.event,v=>effectChange(Diagnose.setEffectEvent(Studio.getGameplayUI(),target,v),false));
      const result=el('p',undefined,'note');result.setAttribute('role','status');
      for(const [label,scenario] of [['試算','current'],['試算（資源為 0）','empty']])details.append(button(label,()=>{
        const ui=Studio.getGameplayUI(),report=Diagnose.analyzeDraft(ui,Core),state=previewState(Studio.getGameplayPreviewData(),report.schema);
        const effect=get(ui,path)?.effect;
        if(!effect){result.textContent='此按鈕已沒有結算效果。';return;}
        // Use the displayed preview state, on a copy, through the production executor.
        if(scenario==='empty')for(const change of effect.changes||[])if(Core.isTargetPath(change.path)&&Number(change.delta)<0)Core.setPath(state,change.path,0);
        const before=structuredClone(state),outcome=Core.executeActionEffect(state,effect);
        result.textContent=outcome.ok?'試算成功：'+[...(effect.changes||[]).map(c=>`${c.path} ${Core.getPath(before,c.path)} → ${Core.getPath(state,c.path)}`),...(effect.items||[]).map(c=>`${c.id} ${JSON.stringify(Core.getPath(state,c.path))}`)].join('；'):'無法結算：'+outcome.reason;
      }));
      details.append(result,button('移除全部結算效果',()=>{if(window.confirm('移除全部結算效果？按鈕文字會保留。'))effectChange(Diagnose.removeEffect(Studio.getGameplayUI(),target));}));
    }
  }
  function drawPreviewValues(state,schema){
    const samples=Diagnose.buildTestState(schema,{},Core),paths=samples.entries.map(e=>e.path);
    const visit=sections=>(sections||[]).forEach(s=>{if(s.type==='tabs')s.tabs.forEach(t=>visit(t.sections));else if(['list','cards','timeline'].includes(s.type)&&s.path)paths.push(s.path);else if(s.type==='location_archive'&&s.destinations_path)paths.push(s.destinations_path);else if(s.type==='actions')s.items.forEach(a=>(a.effect?.items||[]).forEach(i=>paths.push(i.path)));});
    (schema?.panels||[]).forEach(p=>visit(p.sections));
    const unique=[...new Set(paths)].filter(p=>Core.isDisplayPath(p));const key=JSON.stringify(unique);
    if(key===previewValueKey)return;previewValueKey=key;
    const host=q('[data-preview-values]');host.replaceChildren();
    unique.forEach(path=>{
      const value=Core.getPath(state,path),complex=Array.isArray(value)||value&&typeof value==='object';
      const control=field(host,path,complex?JSON.stringify(value):value,text=>{
        try{
          let next=complex?JSON.parse(text):typeof value==='number'?Number(text):text;
          if(complex&&!Array.isArray(next))throw Error('請輸入陣列，例如 []。');
          if(typeof next==='number'&&!Number.isFinite(next))throw Error('請輸入有效數字。');
          sampleOverrides[path]=next;control.setAttribute('aria-invalid','false');updatePreview();
        }catch(e){control.setAttribute('aria-invalid','true');tell('預覽測試值：'+e.message);}
      },{multiline:complex,number:typeof value==='number'});
    });
  }

  const REASONS = {
    schema_not_object: '互動 UI 設定不是物件。', schema_disabled: '互動 UI 被設為停用（enabled:false）。',
    schema_version_unsupported: '互動 UI 版本不支援，目前只支援 version 1。', schema_has_no_usable_content: '還沒有任何可顯示的內容。',
    panel_empty: '面板還沒有區塊，預覽與遊戲都不會顯示它。', panel_has_no_valid_section: '面板內沒有可用的區塊。',
    panel_id_invalid: '面板 ID 不合法（只能用英數字、底線與連字號）。', panel_over_limit: '超過面板數量上限，不會顯示。',
    panel_duplicate_id: '面板 ID 與前面的重複，不會顯示。',
    section_invalid_or_empty: '區塊沒有可用的項目。', section_over_limit: '超過區塊數量上限，不會顯示。',
    items_dropped_or_over_limit: '部分項目無法使用或超過上限，已被略過。',
    meter_value_path_missing: '尚未填寫數值路徑。', meter_value_path_invalid: '數值路徑不合法（請用 modules.角色.欄位 這類路徑）。',
    meter_max_path_invalid: '最大值路徑不合法。', meter_item_invalid: '這個項目無法使用。',
    meter_fixed_max_ignored: '已填最大值路徑，固定最大值會被忽略。', item_over_limit: '超過項目數量上限，不會顯示。',
    item_not_object: '這個項目格式不正確。',
    stat_path_missing: '尚未填寫路徑。', stat_path_invalid: '路徑不合法（請用 modules.角色.欄位，或 time、location、events、npcs）。', stat_item_invalid: '這個項目無法使用。',
    section_path_missing: '尚未填寫資料路徑。', section_path_invalid: '資料路徑不合法（請用 modules.角色.欄位，或 time、location、events、npcs）。',
    nested_tabs_not_allowed: '分頁裡不能再放分頁。',
    enum_value_unknown: '這個選項不在可用清單內，遊戲會改用預設值。',
    archive_time_path_reset: '時間路徑不合法，遊戲會改用 time。', archive_location_path_reset: '地點路徑不合法，遊戲會改用 location。',
    archive_path_cleared: '路徑不合法，遊戲會忽略這個欄位。',
    tabs_default_not_found: '預設分頁 ID 找不到對應的分頁，遊戲會改用第一個分頁。',
    timeline_item_duplicate_path: '同一個路徑只會顯示一次，這個項目會被略過。',
    action_needs_draft_or_effect: '需要填「送出文字」，或設定自動結算，否則按鈕不會出現。',
    action_effect_invalid: '自動結算設定無效，這個按鈕不會出現（為避免誤扣資源，不會退化成純文字按鈕）。',
    effect_empty: '自動結算至少要有一筆數值變動或物品變動。', effect_too_many_entries: '自動結算最多各 8 筆。',
    effect_change_invalid: '數值變動無效：路徑要是 modules.角色.欄位，變動量必須是非 0 的整數。',
    effect_change_duplicate_path: '同一個路徑只能出現一次。',
    effect_item_invalid: '物品變動無效：路徑要是 modules.集合，物品 ID 必須合法，變動量必須是非 0 的整數。',
    effect_item_duplicate: '同一個集合與物品 ID 只能出現一次。', effect_item_conflicts_with_change: '物品集合與上面的數值變動路徑衝突。',
    layout_preset_unknown: '版面預設不存在。', layout_panel_not_found: '版面指定的面板不存在。', layout_right_same_as_left: '右側面板不能與左側相同。'
  };

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
    (schema?.panels||[]).forEach(panel=>visit(panel.sections));seed('time','範例夜晚');seed('location','範例地點');
    const samples=Diagnose.buildTestState(schema,{},Core);
    const visitValue=(value,path)=>{if(Array.isArray(value)||!value||typeof value!=='object'){seed(path,value);return;}Object.entries(value).forEach(([k,v])=>visitValue(v,path?path+'.'+k:k));};
    visitValue(samples.state.modules,'modules');
    for(const k of ['time','location','events','npcs'])if(samples.state[k]!==undefined)seed(k,samples.state[k]);
    for(const def of samples.state.moduleDefinitions)if(!state.moduleDefinitions.some(d=>d.id===def.id))state.moduleDefinitions.push(def);
    for(const [path,value] of Object.entries(sampleOverrides)){if(path.startsWith('modules.')&&Core.isTargetPath(path))Core.setPath(state,path,structuredClone(value));else if(['time','location','events','npcs'].includes(path))state[path]=structuredClone(value);}
    drawPreviewValues(state,schema);return state;
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
    client.on('rendered',result=>{q('[data-preview-stage]').textContent=`${result.viewport||''} · 正式舞臺：${result.resolvedPresentation||'panel'}。此處只預覽單一面板${result.layoutExact?'。':'；完整多欄排列請在正式遊玩驗收。'}`;});
    q('[data-preview-width]').addEventListener('change',syncViewport);
    q('[data-preview-reset]').addEventListener('click',()=>{sampleOverrides={};previewValueKey='';client.reset();updatePreview();tell('預覽資料已重設，作品初始資料保持不變。');});
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
      problems.forEach(problem=>{const path=problem.path.map(v=>({panels:'面板',sections:'區塊',items:'項目',builder:'初始設定',attributes:'屬性',fields:'欄位',choice_groups:'選項群組',theme:'主題',layout:'布局',tabs:'分頁'}[v]|| (typeof v==='number'?v+1:v))).join(' › ');const li=el('li',(path||'整體設定')+'：'+(REASONS[problem.reason]||reasons[problem.status]||'請檢查此設定。'));if(problem.path[0]==='panels'){li.append(button('前往',()=>{selected=[8,6,4,2].map(n=>problem.path.slice(0,n)).find(p=>p.length%2===0&&['panels','sections','tabs'].includes(p.at(-2))&&get(Studio.getGameplayUI(),p)&&typeof get(Studio.getGameplayUI(),p)==='object')||null;drawFields();drawTree();pane('fields');q('[data-field-heading]').focus();}));}list.append(li);});
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
  window.addEventListener('bao:studio-gameplay-loaded',()=>{selected=null;sampleOverrides={};previewValueKey='';draw();});
  window.addEventListener('bao:studio-gameplay-theme-changed',updatePreview);

  window.BAOCharacterStudioGameplayComposer=Object.freeze({refresh:draw});
  draw();
})();
