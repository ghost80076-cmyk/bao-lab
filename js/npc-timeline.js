/* Character-local histories and explicit offscreen schedules. No model calls.
   Scheduled outcomes are opted into by the player, not inferred from a clock. */
(() => {
  'use strict';
  if (window.BAONPCTimeline || !window.BAOEpisodicMemory) return;
  const esc = value => App.escapeHTML(String(value ?? ''));
  const clone = value => structuredClone(value);
  const clock = () => GameState.current?.worldClock?.tickMinutes || 0;
  const anchor = () => Chat.messages.length ? {
    id: Chat.messages.at(-1).id, signature: BAOEpisodicMemory.signature(Chat.messages.at(-1))
  } : null;
  const valid = item => !item.anchor || Chat.messages.some(m => m.id === item.anchor.id && BAOEpisodicMemory.signature(m) === item.anchor.signature);
  const resolutionValid = item => {
    const proof = item.resolution;
    return Boolean(proof?.evidence?.id && typeof proof.quote === 'string' && Chat.messages.some(m =>
      m.id === proof.evidence.id && m.role === 'assistant' && !m.greeting &&
      BAOEpisodicMemory.signature(m) === proof.evidence.signature && typeof m.content === 'string' && m.content.includes(proof.quote)));
  };
  const sameActor = (a,b) => {
    const resolve = BAOEpisodicMemory.resolveActor;
    if (!resolve) return a === b;
    const identity = resolve(GameState.current,a);
    return identity !== null && identity === resolve(GameState.current,b);
  };
  const localSchedules = () => {
    const actors = BAOEpisodicMemory.audience({state:GameState.current,config:App.config,primary:App.activeCharacter?.name || ''});
    if (!actors.length) return [];
    return (GameState.current?.npcTimeline?.schedules || []).filter(s => valid(s) &&
      valid({anchor:s.completedAnchor}) && actors.every(a => sameActor(a,s.actor)) &&
      (s.status !== 'resolved' || resolutionValid(s)));
  };
  const pendingContext = () => localSchedules().filter(s => s.status === 'ready').slice(-6).map(s => ({
    id:s.id,npc_id:s.npcId,actor:s.actor,task:s.text,due_minutes:s.due
  }));
  const resolutionContract = () => pendingContext().length ?
    '【NPC 日程結案 PATCH】\n只有 npc_timeline_ready 內的日程，在本次故事正文確實出現角色的決定或結果後，才可附加 npc_timeline:{"resolve":[{"id":"nt-1","quote":"包含該人物姓名與明確結果的故事原文，8 至 300 字元"}]}。quote 必須逐字引用故事正文，不可引用玩家願望、假設、選項或狀態附錄；不要為了結案補造劇情。拒絕或失敗也可作為結果，尚未決定則保持待判定。無更新時省略此欄。' : '';
  const checkedResolutions = (raw, sourceText = '') => {
    if (!Array.isArray(raw?.resolve) || typeof sourceText !== 'string' || !sourceText) return [];
    const offered = new Set(pendingContext().map(s => s.id));
    const ready = new Map(localSchedules().filter(s => s.status === 'ready' && s.due <= clock() && offered.has(s.id)).map(s => [s.id,s]));
    const checked = [], seen = new Set();
    for (const item of raw.resolve.slice(0,6)) {
      const task = ready.get(item?.id), quote = typeof item?.quote === 'string' ? item.quote.trim() : '';
      if (!task || seen.has(task.id) || quote.length < 8 || quote.length > 300) continue;
      const npc = GameState.current.npcs?.find(n => n.npc_id === task.npcId && sameActor(n.name,task.actor));
      if (!npc || ![npc.name,...(npc.aliases || [])].some(name => typeof name === 'string' && name.trim() && quote.includes(name))) continue;
      const origin = task.anchor ? Chat.messages.findIndex(m => m.id === task.anchor.id) : -1;
      const readyAt = task.completedAnchor ? Chat.messages.findIndex(m => m.id === task.completedAnchor.id) : origin;
      const source = [...Chat.messages.entries()].reverse().find(([i,m]) => i > origin && i >= readyAt &&
        m.role === 'assistant' && !m.greeting && m.id && typeof m.content === 'string' &&
        sourceText.includes(m.content) && m.content.includes(quote));
      if (!source) continue;
      checked.push({id:task.id,quote,evidence:{id:source[1].id,signature:BAOEpisodicMemory.signature(source[1])}});
      seen.add(task.id);
    }
    return checked;
  };
  const applyResolutions = patch => {
    if (!Array.isArray(patch?.resolve)) return;
    for (const item of patch.resolve.slice(0,6)) {
      const task = localSchedules().find(s => s.id === item?.id && s.status === 'ready');
      if (!task || !item.evidence?.id) continue;
      const message = Chat.messages.find(m => m.id === item.evidence.id);
      if (!message || BAOEpisodicMemory.signature(message) !== item.evidence.signature) continue;
      const checked = checkedResolutions({resolve:[item]}, message.content)[0];
      if (!checked || checked.evidence.id !== item.evidence.id) continue;
      task.status = 'resolved'; task.resolution = checked; task.resolvedAt = clock();
    }
  };
  const reopen = id => {
    const task = GameState.current?.npcTimeline?.schedules?.find(s => s.id === id && s.status === 'resolved' && valid(s));
    if (!task) return false;
    task.status = 'ready'; task.completedAnchor = anchor(); delete task.resolution; delete task.resolvedAt;
    return true;
  };
  const ensure = () => {
    const state = GameState.current;
    if (!state) return null;
    if (!state.npcTimeline || state.npcTimeline.version !== 1) state.npcTimeline = {version:1,next:1,schedules:[]};
    const data = state.npcTimeline;
    if (!Array.isArray(data.schedules)) data.schedules = [];
    const pending = data.schedules.filter(s => ['scheduled','ready'].includes(s.status)).slice(0,50);
    const history = data.schedules.filter(s => !['scheduled','ready'].includes(s.status)).slice(-70);
    data.schedules = [...history, ...pending];
    data.next = Math.max(1, Number.isSafeInteger(data.next) ? data.next : 1);
    return data;
  };
  const schedule = ({npcId, text, inMinutes, kind = 'decision'}) => {
    const npc = GameState.current?.npcs?.find(n => n.npc_id === npcId);
    const body = String(text || '').trim();
    const delay = Number(inMinutes), data = ensure();
    if (!data || !npc || !body || body.length > 300 || !Number.isSafeInteger(delay) || delay < 1 || delay > 52560000 || !['routine','decision'].includes(kind)) return false;
    if (data.schedules.filter(s => ['scheduled','ready'].includes(s.status)).length >= 50) return false;
    window.BAOWorldClock?.ensureState?.(true);
    data.schedules.push({id:`nt-${data.next++}`,npcId,actor:npc.name,text:body,kind,
      due:clock()+delay,status:'scheduled',anchor:anchor()});
    return true;
  };
  const advance = () => {
    const data = GameState.current?.npcTimeline;
    if (data?.version !== 1 || !Array.isArray(data.schedules)) return;
    for (const item of data.schedules.slice(-120)) {
      if (item.status !== 'scheduled' || !valid(item) || !Number.isSafeInteger(item.due) || item.due > clock()) continue;
      const npc = GameState.current.npcs?.find(n => n.npc_id === item.npcId && sameActor(n.name,item.actor));
      if (!npc) continue;
      // Present/unknown characters need the active scene to decide what happens.
      item.status = item.kind === 'routine' && npc.presence === 'away' ? 'completed' : 'ready';
      item.processedAt = clock();
      item.completedAnchor = anchor();
    }
  };
  const snapshot = npcId => {
    const npc = GameState.current?.npcs?.find(n => n.npc_id === npcId);
    if (!npc) return null;
    const aliases = [npc.name, ...(npc.aliases || [])];
    const events = BAOEpisodicMemory.knowledgeMatrix({state:GameState.current,messages:Chat.messages,maxEvents:50,includeEvidence:true})
      .flatMap(event => event.knowledge.filter(k => BAOEpisodicMemory.resolveActor ? sameActor(k.actor,npc.name) : aliases.includes(k.actor)).map(k => ({
        id:event.id,time:event.time,text:k.claim,mode:k.mode,certainty:event.certainty,source:'message',actor:k.actor,evidence:Array.isArray(k.evidence)?k.evidence:[]
      })));
    const schedules = (GameState.current.npcTimeline?.schedules || []).filter(s => s.npcId === npcId && valid(s))
      .map(s => ({...clone(s),status:s.status === 'resolved' && (!resolutionValid(s) || !valid({anchor:s.completedAnchor})) || s.status === 'completed' && !valid({anchor:s.completedAnchor}) ? 'invalidated' : s.status}));
    return {npcId,name:npc.name,events,schedules};
  };
  // Resolve only current-state evidence, on demand. Never display rewritten text
  // as the original proof, or accept a source ID from another NPC/branch.
  const reviewSources = ({npcId,eventId,eventActor,scheduleId} = {}) => {
    const data = snapshot(npcId);
    if (!data || Boolean(eventId) === Boolean(scheduleId)) return null;
    let refs, title, kind;
    if (eventId) {
      const matches = data.events.filter(e => e.id === eventId && (!eventActor || e.actor === eventActor));
      const event = matches.length === 1 ? matches[0] : null;
      if (!event || !event.evidence.length) return null;
      title = event.text; kind = 'knowledge';
      refs = event.evidence.map(e => ({...e,label:'取得這項認知的原文'}));
    } else {
      const task = data.schedules.find(s => s.id === scheduleId);
      if (!task) return null;
      title = task.text; kind = 'schedule'; refs = [];
      if (task.anchor) refs.push({...task.anchor,label:'建立日程時的對話位置'});
      if (task.completedAnchor) refs.push({...task.completedAnchor,label:'到期記錄時的對話位置'});
      if (task.resolution?.evidence) refs.push({...task.resolution.evidence,label:'結案故事原文',storyOnly:true});
    }
    return {title,kind,sources:refs.map(ref => {
      const message = Chat.messages.find(m => m.id === ref.id && BAOEpisodicMemory.signature(m) === ref.signature && (!ref.storyOnly || m.role === 'assistant' && !m.greeting));
      const base = {id:ref.id,label:ref.label,available:Boolean(message)};
      if (!message) return base;
      const content = String(message.content || '');
      return {...base,role:message.role,greeting:Boolean(message.greeting),content:content.slice(0,12000),chars:content.length,truncated:content.length>12000};
    })};
  };
  const promptBlock = () => {
    const available = localSchedules().filter(s => ['completed','ready','resolved'].includes(s.status));
    if (!available.length) return '';
    return '【本輪相關 NPC 個別經歷】\n只給角色自己的日程資料；玩家或其他人物不因此知情。待判定事件只表示時間窗口已到，結果尚未發生。\n' + available.slice(-6).map(s =>
      `${s.id}｜${s.actor}｜相對 ${s.due} 分鐘｜${s.status === 'resolved' ? '有來源的故事結果' : s.status === 'completed' ? '玩家明確排定的離場日程已完成' : '待場景判定，未完成'}：${s.status === 'resolved' ? s.resolution.quote : s.text}`).join('\n');
  };
  const apply = GameState.applyUpdate.bind(GameState);
  GameState.applyUpdate = function(update = {}, ...args) { const result = apply(update,...args); advance(); applyResolutions(update.npc_timeline); return result; };
  const normalize = window.BAOHelperData?.stateUpdate;
  if (normalize) window.BAOHelperData.stateUpdate = function(data, defs = [], sourceText = '', ...options) {
    const result = normalize.call(this,data,defs,sourceText,...options);
    const resolve = checkedResolutions(data?.npc_timeline,sourceText);
    if (result && resolve.length) result.npc_timeline = {resolve};
    return result;
  };
  const stateSnapshot = window.WorldStateEngine?.stateSnapshot?.bind(WorldStateEngine);
  if (stateSnapshot) WorldStateEngine.stateSnapshot = function(...args) {
    const result = stateSnapshot(...args) || {}, ready = pendingContext();
    if (ready.length) result.npc_timeline_ready = ready;
    return result;
  };
  App.wrapBuildSystemPrompt('npc-timeline:local-context', function(next, ...args) {
    const base = next(...args), block = promptBlock(); return block ? `${base}\n\n${block}` : base;
  });
  const open = () => {
    if (!document.querySelector('link[href^="css/context-health.css"]')) {
      const link = document.createElement('link'); link.rel = 'stylesheet';
      link.href = 'css/context-health.css?v=4'; document.head.appendChild(link);
    }
    if (!GameState.current) return;
    document.querySelector('[data-npc-timeline]')?.remove();
    const owner = GameState.current, root = document.createElement('div');
    root.dataset.npcTimeline = ''; root.className = 'context-health-backdrop';
    const npcs = (owner.npcs || []).filter(n => n.npc_id);
    root.innerHTML = `<section class="context-health-panel" role="dialog" aria-modal="true" aria-label="NPC 個別時間線">
      <header class="context-health-head"><div><h2>NPC 個別時間線</h2><p>個人經歷取自有效對話來源。排程使用故事相對時間，不隨現實時間推進。</p></div><button class="context-health-close" type="button" aria-label="關閉時間線">×</button></header>
      ${npcs.length ? `<label>人物 <select data-npc>${npcs.map(n => `<option value="${esc(n.npc_id)}">${esc(n.name)}</option>`).join('')}</select></label><div data-history></div>
      <details class="context-health-advanced"><summary>安排離場日程</summary><p>固定日程代表你確認「到期且人物離場時可直接完成」。涉及抉擇或不確定結果請選待判定；人物在場時，一律交由場景判定。</p>
      <form><label>事項 <input name="text" maxlength="300" required></label><label>幾分鐘後 <input name="minutes" type="number" min="1" max="52560000" value="60" required></label><label>處理方式 <select name="kind"><option value="decision">待判定</option><option value="routine">固定日程</option></select></label><button type="submit" class="secondary">加入日程</button></form><p data-message role="status"></p></details>` : '<p>目前沒有已登錄的 NPC。</p>'}</section>`;
    const sourceDetails = (kind,id,actor = '') => `<details class="context-health-advanced" data-source-${kind}="${esc(id)}" data-source-actor="${esc(actor)}"><summary>${kind === 'event' ? '查看知情來源' : '查看日程來源'}</summary><div data-source-body></div></details>`;
    const render = () => {
      if (GameState.current !== owner) { close(); return; }
      const data = snapshot(root.querySelector('[data-npc]')?.value);
      if (!data) return;
      const labels = {scheduled:'已排定',ready:'到期，待判定',completed:'固定日程完成',resolved:'故事已結案',cancelled:'已取消',invalidated:'來源已變更'};
      root.querySelector('[data-history]').innerHTML = `<h3>有來源的個人經歷</h3>${data.events.map(e => `<p>${esc(e.time || e.id)} · ${esc(e.mode)} · ${esc(e.certainty)}<br>${esc(e.text)}</p>${sourceDetails('event',e.id,e.actor)}`).join('') || '<p>尚無可驗證的個人經歷。</p>'}<h3>離場日程</h3>${data.schedules.map(s => `<p>相對 ${esc(s.due)} 分鐘 · ${esc(labels[s.status] || s.status)}<br>${esc(s.text)}${s.resolution ? `<br>結案原文：${esc(s.resolution.quote)}<br><small>來源訊息：${esc(s.resolution.evidence?.id)}</small>` : ''}${['scheduled','ready'].includes(s.status) ? ` <button class="secondary" type="button" data-cancel="${esc(s.id)}">取消</button>` : ''}${s.resolution ? ` <button class="secondary" type="button" data-reopen="${esc(s.id)}">重新待判定</button>` : ''}</p>${sourceDetails('schedule',s.id)}`).join('') || '<p>尚未安排日程。</p>'}`;
    };
    const close = () => { root.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    root.querySelector('.context-health-close').addEventListener('click', close);
    root.addEventListener('click', e => {
      if (e.target === root) close();
      if (e.target.dataset.cancel && GameState.current === owner) {
        const item = owner.npcTimeline?.schedules?.find(s => s.id === e.target.dataset.cancel);
        if (item && ['scheduled','ready'].includes(item.status)) { item.status = 'cancelled'; App.saveStory(false); render(); }
      }
      if (e.target.dataset.reopen && GameState.current === owner && reopen(e.target.dataset.reopen)) { App.saveStory(false); render(); }
    });
    root.addEventListener('toggle', e => {
      const details = e.target;
      if (!details.open || !details.matches('[data-source-event],[data-source-schedule]')) return;
      if (GameState.current !== owner) { close(); return; }
      const data = reviewSources({npcId:root.querySelector('[data-npc]').value,eventId:details.dataset.sourceEvent,eventActor:details.dataset.sourceActor,scheduleId:details.dataset.sourceSchedule});
      const body = details.querySelector('[data-source-body]');
      if (!data) { body.textContent = '來源已變更或不在目前分支，請重新開啟時間線。'; return; }
      body.innerHTML = `${data.kind === 'schedule' ? '<p>日程由玩家安排；建立與到期的對話位置不代表事件已在故事發生。</p>' : ''}${data.sources.map(source => `<p><b>${esc(source.label)}</b> · ${esc(source.id)}${source.available ? ` · ${esc(source.greeting ? '開場' : source.role === 'assistant' ? '故事回覆' : source.role === 'user' ? '玩家輸入' : source.role)} · ${source.chars.toLocaleString()} 字元${source.truncated ? '（顯示節錄）' : ''}` : ' · 來源已變更或已移除'}</p>${source.available ? `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%">${esc(source.content)}</pre>` : ''}`).join('') || '<p>建立時沒有對話來源。</p>'}`;
    }, true);
    root.querySelector('[data-npc]')?.addEventListener('change', render);
    root.querySelector('form')?.addEventListener('submit', e => {
      e.preventDefault(); if (GameState.current !== owner) { close(); return; }
      const form = e.currentTarget;
      const ok = schedule({npcId:root.querySelector('[data-npc]').value,text:form.elements.text.value,
        inMinutes:Number(form.elements.minutes.value),kind:form.elements.kind.value});
      root.querySelector('[data-message]').textContent = ok ? '已加入日程。' : '無法加入，請檢查內容與未完成日程數量。';
      if (ok) { App.saveStory(false); render(); }
    });
    document.body.appendChild(root); document.addEventListener('keydown', onKey); render(); root.querySelector('button').focus();
  };
  window.BAONPCTimeline = Object.freeze({schedule,advance,snapshot,promptBlock,open,pendingContext,resolutionContract,checkedResolutions,reopen,reviewSources});
})();
