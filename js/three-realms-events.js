(() => {
  'use strict';
  if (window.BAOThreeRealmsEvents || !window.BAOThreeRealmsEventsCore || !window.App || !window.BAOWorldModules) return;
  const core = window.BAOThreeRealmsEventsCore;
  const enabled = () => Boolean(window.GameState?.current && window.BAOWorldModules.definitions(App.activeCharacter).some(d => d.id === core.id));
  const commands = (category = 'event') => enabled() ? core.commands.filter(c => c.source === category).map(c => ({ ...c })) : [];
  App.wrapBuildMessages('three-realms-events:requested-event', async function(next, ...args) {
    const owner = window.GameState?.current;
    const active = enabled();
    const latestUser = [...(window.Chat?.messages || [])].reverse().find(m => m.role === 'user')?.content || '';
    const route = owner?.modules?.three_realms_cultivation?.route || '';
    const messages = await next(...args);
    if (!owner || window.GameState?.current !== owner) return messages;
    return core.append(messages, { enabled: active && enabled(), latestUser, route });
  });
  window.BAOThreeRealmsEvents = Object.freeze({ enabled, commands });
})();
