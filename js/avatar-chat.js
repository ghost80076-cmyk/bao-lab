/* Optional reader. Original messages and author's standard reader stay intact. */
(() => {
  'use strict';
  const Core = window.BAOAvatarChatCore;
  if (!Core || !window.App || window.BAOAvatarChat) return;
  const enabled = () => (App.config?.dialogueMode || App.activeCharacter?.dialogue?.mode) === 'avatar_chat';
  function people() {
    const card = App.activeCharacter || {}, state = window.GameState?.current || {};
    const cast = Core.normalize(card.dialogue).cast.map(p => ({...p, id:'author:'+p.id}));
    if (!cast.length && !card.supported_modes?.world && card.name) cast.push({id:'author:main', name:card.name, aliases:[], avatar:Core.image(card.avatar)});
    for (const p of state.storyActors?.hostedCharacters || []) {
      if (p.portable?.rating === 'adult' && !window.BAOContentPreferences?.isAdultContentEnabled?.()) continue;
      cast.push({id:'actor:'+p.id, name:p.name, aliases:[], avatar:Core.image(p.avatar)});
    }
    for (const npc of state.npcs || []) {
      if (!npc.name) continue;
      const matches = cast.filter(p => [p.name,...(p.aliases || [])].includes(npc.name));
      if (matches.length === 1) {
        matches[0].aliases = [...new Set([...matches[0].aliases,...(npc.aliases || [])])];
        continue;
      }
      cast.push({id:'npc:'+(npc.npc_id || npc.name), name:npc.name, aliases:npc.aliases || [], avatar:Core.image(npc.avatar)});
    }
    const p = App.config?.persona;
    if (p?.name) cast.unshift({id:'player', name:p.name, aliases:[], avatar:Core.image(p.avatar)});
    const overrides = App.config?.portraitOverrides || {};
    return cast.map(p => ({...p, avatar:Object.prototype.hasOwnProperty.call(overrides,p.id) ? Core.image(overrides[p.id]) : p.avatar}));
  }
  function resolve(value) {
    const src = Core.image(value);
    return src.startsWith('yorubay-asset://') ? window.CharacterEngine?.getWorkAssetURL?.(App.activeCharacter?.id,src.slice(16)) || '' : src;
  }
  function plain(raw) {
    const source = String(raw || '').replace(/\[STATUS\][\s\S]*?(?:\[\/STATUS\]|$)/gi,'')
      .replace(/\[SCENE:[a-z-]+\]/gi,'').replace(/\[\/?(?:NARRATION|CHOICE)\]/gi,'');
    if (!/<\/?[a-z][^>]*>/i.test(source)) return source;
    const doc = new DOMParser().parseFromString(source,'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,template,svg,math').forEach(el => el.remove());
    doc.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    doc.querySelectorAll('p,div,section,article,li,h1,h2,h3,h4,tr').forEach(el => el.append('\n'));
    return doc.body.textContent.trim();
  }
  function transform(text) {
    let result = text;
    // Text rules remain display-only; rich HTML rules belong to standard mode.
    try {
      const saved = JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:'+encodeURIComponent(App.activeCharacter?.id || '')) || 'null');
      if (saved?.enabled && window.BAOAuthorRegexCore) {
        const rules = BAOAuthorRegexCore.normalize(saved.rules).filter(r => r.enabled && !r.reason && !r.rich);
        const value = BAOAuthorRegexCore.render(result, rules, false);
        if (value?.matched && !value.rich) result = value.text;
      }
    } catch {}
    const rules = window.BAORegex?.load?.();
    if (rules?.active) result = BAORegex.apply(result, rules.rules);
    return window.BAOPlayerTextReplace?.applyChat?.(result, window.BAOPlayerTextReplace.get?.()) ?? result;
  }
  const canonical = html => { const template = document.createElement('template'); template.innerHTML = html; return template.innerHTML; };
  function render(raw, role = 'assistant') {
    const cast = people();
    if (role === 'user') {
      const player = cast.find(p => p.id === 'player') || {id:'player',name:'玩家',avatar:''};
      return canonical(`<div class="avatar-chat">${Core.speech(player,String(raw || ''),resolve)}</div>`);
    }
    const source = window.BAOChatPresentationCore?.stripStatusAppendix?.(raw) ?? raw;
    return canonical(Core.render(plain(source),cast.filter(p => p.id !== 'player'),resolve,transform));
  }
  function refresh() {
    window.BAOSceneHTML?.refresh?.();
    window.BAOSceneRenderIntegrity?.schedule?.();
    // User turns have no authored HTML renderer. Repaint only aligned, committed turns.
    const nodes = [...document.querySelectorAll('#chat-stream > .message')], messages = window.Chat?.messages || [];
    const offset = nodes.length === messages.length + 1 && (nodes[0]?.dataset.storyGreeting === 'true' || nodes[0]?.querySelector('.bubble')?.dataset.authoredGreeting === 'true') ? 1 : 0;
    if (nodes.length !== messages.length + offset || !messages.every((m,i) => nodes[i+offset].classList.contains(m.role === 'user' ? 'user' : 'assistant'))) return;
    messages.forEach((m,i) => {
      if (m.role !== 'user') return;
      const bubble = nodes[i+offset].querySelector('.bubble');
      if (!bubble || bubble.querySelector('.story-inline-editor')) return;
      const html = enabled() ? render(m.content,'user') : App.formatMessage(m.content);
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
    });
  }
  async function persist() {
    if (window.GameState?.current) GameState.current.config = App.config;
    if (App.saveStory(false) === false) throw new Error('儲存失敗，請先備份故事並檢查裝置空間。');
    await Storage.flush?.();
    if (Storage.status?.().lastError) throw new Error('頭像暫時未能確認寫入；請備份故事並檢查儲存空間。');
  }
  function openPortraits() {
    document.getElementById('avatar-chat-dialog')?.remove();
    const owner = GameState.current, config = App.config, cast = people();
    const dialog = document.createElement('dialog'); dialog.id = 'avatar-chat-dialog'; dialog.className = 'avatar-chat-dialog';
    dialog.innerHTML = '<form><h2>本故事的角色頭像</h2><p>可替作者角色、玩家人物及已登記 NPC 設定頭像。只影響這份故事。</p><label>人物<select data-person></select></label><div data-editor></div><p role="status" data-status></p><footer><button type="button" data-close>關閉</button><button type="submit">儲存頭像</button></footer></form>';
    const select = dialog.querySelector('[data-person]');
    cast.forEach(p => {const option = document.createElement('option'); option.value=p.id; option.textContent=p.name+' · '+(p.id==='player'?'玩家':p.id.startsWith('npc:')?'NPC':p.id.startsWith('actor:')?'加入的人物':'作者角色'); select.append(option);});
    const show = () => {dialog.querySelector('[data-editor]').innerHTML = BAOPortraitInput.field(cast.find(p => p.id===select.value)?.avatar || '');};
    select.onchange = show; show();
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const status = dialog.querySelector('[data-status]');
      if (owner !== GameState.current || config !== App.config) {status.textContent='故事已切換，請重新開啟頭像設定。'; return;}
      if (dialog.querySelector('[data-portrait-upload]')?.disabled) {status.textContent='請等待圖片處理完成。'; return;}
      if (!cast.some(p => p.id===select.value)) return;
      const before = config.portraitOverrides;
      config.portraitOverrides = {...before, [select.value]:Core.image(dialog.querySelector('input[name="avatar"]').value)};
      try {await persist(); cast.find(p => p.id===select.value).avatar = config.portraitOverrides[select.value]; refresh(); status.textContent='已儲存；此故事的備份會包含頭像。';}
      catch(error) {config.portraitOverrides=before; status.textContent=error.message;}
    };
    document.body.append(dialog); dialog.showModal();
  }
  function mount() {
    const aside = document.querySelector('#chat-view aside');
    if (!aside || !App.config) return;
    let panel = document.getElementById('avatar-chat-controls');
    if (!panel) {
      panel = document.createElement('section'); panel.id='avatar-chat-controls'; panel.className='avatar-chat-controls';
      panel.innerHTML='<label>對話顯示<select aria-label="對話顯示模式"><option value="standard">標準模式（保留作品排版）</option><option value="avatar_chat">角色頭像對話</option></select></label><button type="button">設定角色頭像</button><small>頭像模式使用姓名對話與旁白；作者 HTML 演出暫停，切回標準模式即可恢復。</small><span role="status"></span>';
      panel.querySelector('select').onchange = async event => {
        if (App.__requestPending) {event.target.value=enabled()?'avatar_chat':'standard'; panel.querySelector('[role=status]').textContent='請等這輪生成完成再切換。'; return;}
        const config = App.config, before = config.dialogueMode;
        config.dialogueMode = event.target.value;
        try {await persist(); App.renderChatShell(false); refresh();}
        catch(error) {config.dialogueMode=before; event.target.value=enabled()?'avatar_chat':'standard'; panel.querySelector('[role=status]').textContent=error.message;}
      };
      panel.querySelector('button').onclick=openPortraits;
      (aside.querySelector('[data-chat-tool-body="scene"]') || aside).append(panel);
    }
    panel.querySelector('select').value=enabled()?'avatar_chat':'standard';
  }
  window.BAOAvatarChat = {enabled, people, render, refresh, openPortraits};
  App.wrapRenderChatShell('avatar-chat:controls', function(next,...args) {const result=next(...args); mount(); refresh(); return result;});
  ['bao:player-text-replace-changed','bao:regex-changed'].forEach(type => window.addEventListener(type,refresh));
  mount();
})();
