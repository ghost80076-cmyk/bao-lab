/* Declarative, author-owned starting scenes. No scripts, storage or model calls. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOStoryStartupCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const clone = x => JSON.parse(JSON.stringify(x));
  const path = x => /^modules\.[a-zA-Z][a-zA-Z0-9_-]{0,39}(?:\.[a-zA-Z][a-zA-Z0-9_-]{0,39}){0,4}$/.test(x || '') && !String(x).split('.').some(k => ['__proto__','constructor','prototype'].includes(k));
  const get = (state, p) => path(p) ? p.split('.').reduce((x,k) => x?.[k],state) : undefined;
  const put = (state, p, value) => {
    const keys = p.split('.'); let node = state;
    for (const k of keys.slice(0,-1)) { if (!object(node[k])) node[k] = {}; node = node[k]; }
    node[keys.at(-1)] = clone(value);
  };
  const text = (s,n) => typeof s === 'string' ? s.slice(0,n) : '';
  function normalize(raw) {
    if (!object(raw) || raw.version !== 1 || !path(raw.selector_path)) return null;
    const cases = (Array.isArray(raw.cases) ? raw.cases : []).slice(0,32).filter(object).map(c => ({
      value: text(c.value,240), time:text(c.time,120), location:text(c.location,160),
      greeting:text(c.greeting,8000),
      choices:(Array.isArray(c.choices) ? c.choices : []).map(x=>text(x,240)).filter(Boolean).slice(0,4),
      patches:(Array.isArray(c.patches) ? c.patches : []).filter(x=>object(x) && path(x.path) && x.value !== undefined && JSON.stringify(x.value).length <= 3000).slice(0,16).map(x=>({path:x.path,value:clone(x.value)}))
    })).filter(c=>c.value && c.greeting);
    if (!cases.length || new Set(cases.map(c=>c.value)).size !== cases.length) return null;
    return {version:1,selector_path:raw.selector_path,cases,
      default_selector_path:path(raw.default_selector_path) ? raw.default_selector_path : '',
      default_when:text(raw.default_when,240),
      fallback_greeting:text(raw.fallback_greeting,8000),
      fallback_location:text(raw.fallback_location,160),
      defaults:(Array.isArray(raw.defaults) ? raw.defaults : []).filter(d=>object(d) && path(d.path) && path(d.by_path) && object(d.values)).slice(0,8).map(d=>({path:d.path,by_path:d.by_path,when:text(d.when,240),values:Object.fromEntries(Object.entries(d.values).slice(0,32).map(([k,v])=>[k,text(v,240)]))})),
      fallback_choices:(Array.isArray(raw.fallback_choices) ? raw.fallback_choices : []).map(x=>text(x,240)).filter(Boolean).slice(0,4)};
  }
  function expand(value, state) {
    // Only scalar public module fields can enter authored scene text.
    return String(value || '').replace(/\{\{(modules\.[^{}]+)\}\}/g, (_,p) => {
      const v = get(state,p); return ['string','number','boolean'].includes(typeof v) ? String(v).slice(0,240) : '未設定';
    });
  }
  function apply(raw, state, definitions = []) {
    const spec = normalize(raw);
    if (!spec || !object(state)) return null;
    const allowed = new Map(definitions.filter(object).map(d=>[d.id,d.kind === 'collection' ? 'collection' : 'object']));
    if (spec.defaults.some(d=>allowed.get(d.path.split('.')[1]) !== 'object' || d.path.split('.').length < 3)) return null;
    const pendingDefaults = spec.defaults.filter(d=>get(state,d.path) === d.when && Object.hasOwn(d.values,String(get(state,d.by_path))))
      .map(d=>({path:d.path,value:d.values[String(get(state,d.by_path))]}));
    const rawSelected = String(get(state,spec.selector_path) || '');
    const selected = rawSelected === spec.default_when && spec.default_selector_path
      ? String(get(state,spec.default_selector_path) || '') : rawSelected;
    const entry = spec.cases.find(c=>c.value === selected);
    if (!entry && !spec.fallback_greeting) return null;
    // Validate the whole patch before changing anything; undeclared modules are rejected.
    if (entry && entry.patches.some(p => {
      const keys = p.path.split('.'); const kind = allowed.get(keys[1]);
      return !kind || (kind === 'collection' && (keys.length !== 2 || !Array.isArray(p.value))) || (kind === 'object' && keys.length === 2 && !object(p.value));
    })) return null;
    for (const p of pendingDefaults) put(state,p.path,p.value);
    if (entry) for (const p of entry.patches) put(state,p.path,p.value);
    if (entry?.time) state.time = expand(entry.time,state);
    if (entry?.location) state.location = expand(entry.location,state);
    else if (spec.fallback_location) state.location = expand(spec.fallback_location,state);
    const greeting = expand(entry?.greeting || spec.fallback_greeting,state);
    const choices = (entry?.choices || spec.fallback_choices).map(c=>expand(c,state));
    return {greeting, opening:{type:'noir',label:'開場紀錄',posts:[{kind:'character',meta:[state.time,state.location].filter(Boolean).join('｜'),content:greeting.replace(/【\/?YB:[A-Z0-9:_-]+】/g,'').trim()}],choices,note:''},selected};
  }
  return {normalize,apply,expand};
});
