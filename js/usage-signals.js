(function(root) {
  'use strict';
  const preferenceKey = 'yorubay-usage-signals-v1';
  const stateKey = 'yorubay-usage-signals-tab-v1';
  const names = ['started', 'first_success', 'first_failure', 'five_turns'];
  let pending = new Set(), timer = null, state;
  const day = () => new Date().toISOString().slice(0,10);
  function enabled() {
    if (root.navigator?.globalPrivacyControl || root.navigator?.doNotTrack === '1') return false;
    try { return root.localStorage.getItem(preferenceKey) === 'yes'; } catch { return false; }
  }
  function current() {
    if (state?.day === day()) return state;
    pending.clear();
    try { state = JSON.parse(root.sessionStorage.getItem(stateKey)); } catch {}
    if (!state || state.day !== day() || !Array.isArray(state.sent)) state = {day:day(), sent:[], successes:0, batches:0};
    return state;
  }
  function save() { try { root.sessionStorage.setItem(stateKey, JSON.stringify(state)); } catch {} }
  function mark(name) {
    if (!enabled() || !names.includes(name)) return;
    const s = current();
    if (s.sent.includes(name)) return;
    s.sent.push(name); save(); pending.add(name);
    if (timer === null) timer = root.setTimeout(flush, 1200);
  }
  function flush() {
    if (timer !== null) root.clearTimeout(timer);
    timer = null;
    if (!enabled()) { pending.clear(); return; }
    const s = current();
    if (!pending.size || s.batches >= 4 || !root.crypto?.getRandomValues) { pending.clear(); return; }
    const token = Array.from(root.crypto.getRandomValues(new Uint8Array(16)), x=>x.toString(16).padStart(2,'0')).join('');
    const body = JSON.stringify({v:1, day:s.day, token, events:[...pending]});
    pending.clear(); s.batches++; save();
    // No cookies, auth headers, URL/referrer, retries or durable upload queue.
    try {
      root.fetch('https://api.yorubay.com/usage-signals', {
        method:'POST', credentials:'omit', referrerPolicy:'no-referrer', keepalive:true,
        headers:{'Content-Type':'text/plain;charset=UTF-8'}, body
      }).catch(()=>{});
    } catch {}
  }
  function setEnabled(value) {
    try { root.localStorage.setItem(preferenceKey, value ? 'yes' : 'no'); } catch {}
    if (!enabled()) { pending.clear(); if (timer !== null) root.clearTimeout(timer); timer = null; }
    syncControls();
  }
  function syncControls() {
    root.document?.querySelectorAll('[data-usage-signals]').forEach(input=>{
      input.checked = enabled();
      input.disabled = Boolean(root.navigator?.globalPrivacyControl || root.navigator?.doNotTrack === '1');
    });
  }
  root.BAOUsageSignals = Object.freeze({enabled, setEnabled, mark, flush});
  root.addEventListener('pagehide', flush);
  root.addEventListener('storage', event=>{ if (event.key === preferenceKey || event.key === null) { if (!enabled()) pending.clear(); syncControls(); } });
  root.document?.addEventListener('change', event=>{
    if (event.target?.matches?.('[data-usage-signals]')) setEnabled(event.target.checked);
  });
  syncControls();
  if (typeof App !== 'undefined') App.wrapShowView('usage-signals:start', function(next, name, ...args) {
    const result = next(name, ...args);
    if (name === 'chat' && typeof GameState !== 'undefined' && GameState.current && !this.config?.demoMode) mark('started');
    return result;
  });
  if (typeof API !== 'undefined') API.wrapSend('usage-signals:result', async function(next, config, messages, ...args) {
    const owner = typeof GameState !== 'undefined' ? GameState.current : null;
    const main = owner && typeof App !== 'undefined' && !App.config?.demoMode
      && !['__connectionTest','__memoryTask','__stateTask','__storyTool','__auxiliaryTask'].some(key=>config?.[key]);
    const observe = () => main && GameState.current === owner && enabled();
    try {
      const result = await next(config, messages, ...args);
      if (observe() && typeof result?.text === 'string' && result.text.trim()) {
        mark('started'); mark('first_success');
        const s = current(); s.successes = Math.min(5, (Number(s.successes) || 0) + 1); save();
        if (s.successes === 5) mark('five_turns');
      }
      return result;
    } catch (error) {
      if (observe() && error?.code !== 'BAO_ABORTED' && error?.name !== 'AbortError') { mark('started'); mark('first_failure'); }
      throw error;
    }
  });
})(window);
