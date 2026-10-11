/* Opt-in memory frames: present-day state cannot be changed by a flashback. */
(function() {
  'use strict';
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  function policy() {
    const p = App.activeCharacter?.timeline_policy;
    return p?.version === 1 && /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(p.module || '') &&
      !['constructor','prototype','__proto__'].includes(p.module) &&
      App.activeCharacter?.world_modules?.some(m => m.id === p.module && m.kind !== 'collection') &&
      typeof p.past_value === 'string' && typeof p.present_value === 'string' ? p : null;
  }
  function transition(text) {
    const p = policy(), state = GameState.current;
    if (!p || !object(state?.modules?.[p.module])) return false;
    const line = String(text || '').trim();
    const entry = /^【回憶】\s*(.{1,240})$/u.exec(line);
    const back = /^【回到現在】$/u.test(line);
    if (!entry && !back) return false;
    const frame = state.modules[p.module];
    if (entry) {
      frame.current = p.past_value;
      frame.past_time = entry[1];
      frame.past_location = '';
      frame.past_events = [];
    } else frame.current = p.present_value;
    return true;
  }
  const original = GameState.applyUpdate.bind(GameState);
  const addEvent = GameState.addEvent?.bind(GameState);
  if (addEvent) GameState.addEvent = function(text) {
    const p = policy(), frame = p && this.current?.modules?.[p.module];
    if (frame?.current === p?.past_value && p) {
      frame.past_events = [String(text).slice(0,500), ...(frame.past_events || [])].slice(0,24);
      return;
    }
    return addEvent(text);
  };
  GameState.applyUpdate = function(update = {}) {
    const p = policy(), frame = p && this.current?.modules?.[p.module];
    if (!object(frame)) return original(update);
    const incoming = object(update?.modules?.[p.module]) ? update.modules[p.module] : {};
    if (frame.current === p.past_value) {
      // Do not invoke other update wrappers: clocks, NPC registries and resources
      // all belong to the frozen present. Only the memory record may change.
      for (const key of ['past_time','past_location']) {
        if (typeof incoming[key] === 'string') frame[key] = incoming[key].slice(0,240);
      }
      if (Array.isArray(incoming.past_events)) {
        frame.past_events = incoming.past_events.filter(x => typeof x === 'string').slice(-24).map(x => x.slice(0,500));
      }
      return;
    }
    // A model cannot switch frames or overwrite the saved present baseline.
    const filtered = {...update};
    if (object(update.modules) && object(update.modules[p.module])) {
      filtered.modules = {...update.modules, [p.module]:{...frame,...incoming,current:frame.current,present_time:frame.present_time}};
    }
    return original(filtered);
  };
  App.wrapSendMessage('story-timeline:explicit-command', function(next, ...args) {
    transition(document.getElementById('user-input')?.value);
    return next(...args);
  });
  App.wrapBuildSystemPrompt('story-timeline:frame', function(next, ...args) {
    const base = next(...args), p = policy(), frame = p && GameState.current?.modules?.[p.module];
    if (frame?.current !== p?.past_value || !p) return base;
    return `${base}\n\n【當前回憶框架】\n回溯：${frame.past_time || '未確認時間'}。回憶位置：${frame.past_location || '依已確認往事建立'}。這是往事／角色陳述／重演，未定內容保持未定。現在的時間、資產、傷勢、名冊與任務保持不動。只提交 modules.${p.module} 的 past_time、past_location、past_events；不得把回憶結果直接變成現在已完成的事。玩家明確輸入【回到現在】才退出此框架。`;
  });
  window.BAOStoryTimeline = {transition};
})();
