/* Lightweight author path built from the SAME form controls as the full studio.
   Field nodes are moved, never cloned. The existing draft/save/export pipeline
   remains the only state owner and source of truth. */
(() => {
  'use strict';
  const form = document.getElementById('studio-form');
  const editor = document.querySelector('.studio-editor');
  const flow = window.BAOCharacterStudioFlow;
  const studio = window.BAOCharacterStudio;
  if (!form || !editor || !flow || !studio || window.BAOStudioSimpleCreate) return;

  const field = name => form.elements.namedItem(name);
  const required = ['name', 'system_prompt', 'greeting'];
  const labels = new Map();
  const anchors = new Map();
  for (const name of required) {
    const control = field(name);
    const label = control?.closest('label');
    if (!control || !label || !form.contains(label)) return;
    labels.set(name, label);
    const anchor = document.createComment('studio-simple-' + name);
    label.before(anchor);
    anchors.set(name, anchor);
  }

  const preview = document.getElementById('studio-preview');
  if (!preview || !form.contains(preview)) return;
  const previewAnchor = document.createComment('studio-simple-preview');
  preview.before(previewAnchor);

  const steps = [
    {id:'character', label:'角色設定', heading:'先建立角色的核心', detail:'寫下角色或世界的個性、關係、語氣與規則。其他設定都能之後補上。'},
    {id:'opening', label:'故事開場', heading:'玩家打開故事會看見什麼？', detail:'寫下第一幕，讓玩家能自然接話、選擇或行動。'},
    {id:'finish', label:'預覽完成', heading:'確認故事，就可以存成草稿', detail:'先在本機預覽，再儲存、試玩或匯出。不會自動上架。'}
  ];
  let quick = false;
  let active = 'character';

  const root = document.createElement('section');
  root.id = 'studio-simple-create';
  root.setAttribute('aria-label','精簡角色卡創作流程');
  const header = document.createElement('div');
  header.className = 'studio-simple-head';
  const copy = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = '三步完成角色卡';
  const desc = document.createElement('p');
  desc.textContent = '只填三項內容就能開始；進階世界書、人物與互動工具隨時可開。';
  copy.append(heading,desc);
  const openFull = document.createElement('button');
  openFull.type = 'button';
  openFull.className = 'secondary';
  openFull.id = 'studio-simple-open-full';
  openFull.textContent = '完整工具';
  openFull.title = '保留已填內容，打開人物、世界書、手機與互動 UI';
  header.append(copy,openFull);
  root.append(header);

  const nav = document.createElement('nav');
  nav.className = 'studio-simple-nav';
  nav.setAttribute('aria-label','精簡創作步驟');
  steps.forEach((step, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.simpleStep = step.id;
    const number = document.createElement('span');
    number.textContent = String(index+1);
    const label = document.createElement('b');
    label.textContent = step.label;
    button.append(number,label);
    nav.append(button);
  });
  root.append(nav);

  const content = document.createElement('div');
  content.className = 'studio-simple-content';
  const panels = new Map();
  for (const step of steps) {
    const panel = document.createElement('section');
    panel.className = 'studio-simple-panel';
    panel.dataset.simplePanel = step.id;
    panel.setAttribute('aria-label',step.label);
    const title = document.createElement('h4');
    title.textContent = step.heading;
    const hint = document.createElement('p');
    hint.className = 'note';
    hint.textContent = step.detail;
    panel.append(title,hint);
    content.append(panel);
    panels.set(step.id,panel);
  }
  root.append(content);

  const nameLabel = labels.get('name');
  const coreLabel = labels.get('system_prompt');
  const greetingLabel = labels.get('greeting');
  nameLabel.classList.add('studio-simple-field-name');
  coreLabel.classList.add('studio-simple-field-core');
  greetingLabel.classList.add('studio-simple-field-opening');
  const optional = document.createElement('button');
  optional.type = 'button';
  optional.className = 'secondary studio-simple-other';
  optional.textContent = '更多設定：取向、分級、封面、標籤與角色 ID';
  const idHint = document.createElement('p');
  idHint.className = 'note studio-simple-id-note';
  idHint.textContent = '角色 ID 已自動產生；需要自訂時可以到完整工具修改。';

  const actions = document.createElement('div');
  actions.className = 'studio-simple-actions';
  const actionMap = [
    {id:'studio-preview-button',text:'預覽',className:'secondary'},
    {id:'studio-save-draft',text:'儲存草稿',className:'primary'},
    {id:'studio-install',text:'加入我的角色',className:'secondary'},
    {id:'studio-export',text:'匯出夜灣 JSON',className:'secondary'}
  ];
  for (const item of actionMap) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.text;
    button.className = item.className;
    button.dataset.simpleAction = item.id;
    actions.append(button);
  }
  const notice = document.createElement('p');
  notice.className = 'note';
  notice.textContent = '草稿只儲存在這台裝置，請定期匯出備份；加入我的角色不等於公開發佈。';
  panels.get('finish').append(actions,notice);

  const message = document.createElement('p');
  message.id = 'studio-simple-message';
  message.setAttribute('role','status');
  message.setAttribute('aria-live','polite');
  message.className = 'studio-simple-message';
  const controls = document.createElement('div');
  controls.className = 'studio-simple-controls';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'secondary';
  back.textContent = '← 上一步';
  const progress = document.createElement('span');
  progress.id = 'studio-simple-position';
  progress.setAttribute('aria-live','polite');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'primary';
  next.textContent = '下一步 →';
  controls.append(back,progress,next);
  root.append(message,controls);

  const allTools = document.createElement('button');
  allTools.type = 'button';
  allTools.className = 'secondary studio-simple-all';
  allTools.id = 'studio-simple-open-all';
  allTools.textContent = '全部欄位';
  allTools.title = '切換到原本的完整編輯介面，所有內容都會保留';
  header.append(allTools);
  const workspace = form.querySelector('.studio-flow-workspace');
  if (!workspace) return;
  form.insertBefore(root,workspace);

  const returnButton = document.createElement('button');
  returnButton.type = 'button';
  returnButton.className = 'secondary';
  returnButton.id = 'studio-return-simple';
  returnButton.textContent = '精簡創作';
  returnButton.title = '使用三步驟介面繼續編輯，所有既有設定保持不變';
  editor.querySelector('.studio-toolbar')?.append(returnButton);

  function moveFields() {
    panels.get('character').append(nameLabel,coreLabel,idHint,optional);
    panels.get('opening').append(greetingLabel);
    panels.get('finish').insertBefore(preview,actions);
  }
  function restoreFields() {
    for (const name of required) anchors.get(name).after(labels.get(name));
    previewAnchor.after(preview);
  }

  function refresh() {
    root.querySelectorAll('[data-simple-panel]').forEach(panel => {
      panel.hidden = panel.dataset.simplePanel !== active;
    });
    nav.querySelectorAll('[data-simple-step]').forEach(button => {
      const selected = button.dataset.simpleStep === active;
      button.classList.toggle('active',selected);
      if (selected) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
    const index = steps.findIndex(step=>step.id===active);
    back.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    next.textContent = index === 0 ? '下一步：故事開場 →' : '下一步：預覽完成 →';
    progress.textContent = (index+1) + ' / 3 · ' + steps[index].label;
  }
  function missing(step) {
    const names = step === 'character' ? ['name','system_prompt'] :
      step === 'opening' ? ['greeting'] : [];
    return names.find(name => !String(field(name)?.value||'').trim()) || null;
  }
  function navigate(id, enforce = true) {
    const from = steps.findIndex(step=>step.id===active);
    const to = steps.findIndex(step=>step.id===id);
    if (to < 0) return;
    if (enforce && to > from) {
      for (let index=from;index<to;index++) {
        const name = missing(steps[index].id);
        if (name) {
          message.textContent = '請先填寫「' + ({
            name:'角色／作品名稱',system_prompt:'核心設定',greeting:'故事開場'
          }[name]) + '」，才能前往下一步。';
          field(name)?.focus({preventScroll:true});
          return;
        }
      }
    }
    message.textContent = '';
    active = id;
    refresh();
    root.scrollIntoView({block:'start',behavior:'auto'});
  }

  function enterAdvanced(showAll = false, step = 'basic', navigate = true) {
    if (quick) restoreFields();
    quick = false;
    editor.dataset.studioSimple = 'false';
    root.hidden = true;
    returnButton.hidden = false;
    flow.setShowAll(Boolean(showAll));
    if (!showAll && navigate) flow.go(step);
  }
  function enterSimple() {
    if (!quick) moveFields();
    quick = true;
    editor.dataset.studioSimple = 'true';
    root.hidden = false;
    returnButton.hidden = true;
    flow.setShowAll(false);
    active = 'character';
    message.textContent = '';
    refresh();
  }

  nav.addEventListener('click',event => {
    const button = event.target.closest('[data-simple-step]');
    if (button) navigate(button.dataset.simpleStep);
  });
  next.addEventListener('click',() => {
    if (active === 'character') navigate('opening');
    else if (active === 'opening') navigate('finish');
  });
  back.addEventListener('click',() => {
    if (active === 'opening') navigate('character',false);
    else if (active === 'finish') navigate('opening',false);
  });
  openFull.addEventListener('click',()=>enterAdvanced(false,'basic'));
  allTools.addEventListener('click',()=>enterAdvanced(true,'basic'));
  optional.addEventListener('click',()=>enterAdvanced(false,'basic'));
  returnButton.addEventListener('click',enterSimple);
  actions.addEventListener('click',event => {
    const trigger=event.target.closest('[data-simple-action]');
    if (!trigger) return;
    const original=document.getElementById(trigger.dataset.simpleAction);
    if (original && !original.disabled) original.click();
  });

  // Sidebar shortcuts have their own established six-step routes.
  const sidebar=editor.parentElement?.querySelector('.studio-actions');
  sidebar?.addEventListener('click',event=>{
    // File imports do not use flow.go; other shortcuts announce their own
    // native stage through bao:studio-flow-navigate.
    const button=event.target.closest('[data-creation-route="import"]');
    if (quick && button) enterAdvanced(false,'basic');
  },true);

  window.addEventListener('bao:studio-flow-navigate',event=>{
    const id=event.detail?.id;
    if (quick && id && id!=='basic') enterAdvanced(false,id,false);
  });
  window.addEventListener('bao:character-studio-card-shown',()=>{
    // A loaded draft / existing multi-NPC world should open full editing by default.
    // Run after the existing studio has populated the form and base payload.
    queueMicrotask(()=>{
      const state=studio.getState();
      if (state?.hasDraft || field('mode')?.value==='world') enterAdvanced(false,'basic');
      else enterSimple();
    });
  });
  window.BAOStudioSimpleCreate=Object.freeze({
    enterSimple,enterAdvanced,
    getState:()=>({quick,step:active}),
    navigate
  });
  enterSimple();
})();