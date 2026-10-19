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
      const npc = GameState.current.npcs?.find(n => n.npc_id === item.npcId && n.name === item.actor);
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
    const events = BAOEpisodicMemory.knowledgeMatrix({state:GameState.current,messages:Chat.messages,maxEvents:50})
      .flatMap(event => event.knowledge.filter(k => aliases.includes(k.actor)).map(k => ({
        id:event.id,time:event.time,text:k.claim,mode:k.mode,certainty:event.certainty,source:'message'
      })));
    const schedules = (GameState.current.npcTimeline?.schedules || []).filter(s => s.npcId === npcId && valid(s))
      .map(s => ({...clone(s),status:s.status === 'completed' && !valid({anchor:s.completedAnchor}) ? 'invalidated' : s.status}));
    return {npcId,name:npc.name,events,schedules};
  };
  const promptBlock = () => {
    const actors = BAOEpisodicMemory.audience({state:GameState.current,config:App.config,primary:App.activeCharacter?.name || ''});
    if (!actors.length) return '';
    const available = (GameState.current?.npcTimeline?.schedules || []).filter(s =>
      valid(s) && valid({anchor:s.completedAnchor}) && ['completed','ready'].includes(s.status) && actors.every(a => a === s.actor));
    if (!available.length) return '';
    return '【本輪相關 NPC 個別經歷】\n只給角色自己的日程資料；玩家或其他人物不因此知情。待判定事件只表示時間窗口已到，結果尚未發生。\n' + available.slice(-6).map(s =>
      `${s.actor}｜相對 ${s.due} 分鐘｜${s.status === 'completed' ? '玩家明確排定的離場日程已完成' : '待場景判定，未完成'}：${s.text}`).join('\n');
  };
  const apply = GameState.applyUpdate.bind(GameState);
  GameState.applyUpdate = function(...args) { const result = apply(...args); advance(); return result; };
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
    const render = () => {
      if (GameState.current !== owner) { close(); return; }
      const data = snapshot(root.querySelector('[data-npc]')?.value);
      if (!data) return;
      const labels = {scheduled:'已排定',ready:'到期，待判定',completed:'固定日程完成',cancelled:'已取消',invalidated:'來源已變更'};
      root.querySelector('[data-history]').innerHTML = `<h3>有來源的個人經歷</h3>${data.events.map(e => `<p>${esc(e.time || e.id)} · ${esc(e.mode)} · ${esc(e.certainty)}<br>${esc(e.text)}</p>`).join('') || '<p>尚無可驗證的個人經歷。</p>'}<h3>離場日程</h3>${data.schedules.map(s => `<p>相對 ${esc(s.due)} 分鐘 · ${esc(labels[s.status] || s.status)}<br>${esc(s.text)}${['scheduled','ready'].includes(s.status) ? ` <button class="secondary" type="button" data-cancel="${esc(s.id)}">取消</button>` : ''}</p>`).join('') || '<p>尚未安排日程。</p>'}`;
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
    });
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
  window.BAONPCTimeline = Object.freeze({schedule,advance,snapshot,promptBlock,open});
})();
