(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOStudioCreationMapCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';

  const text = value => String(value ?? '').trim();
  const array = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  function derive(input = {}) {
    const npcs = array(input.npcs).filter(item => item && typeof item === 'object');
    const npcNames = npcs.map(item => text(item.name)).filter(Boolean);
    const statusFields = array(input.statusFields).filter(item => item && typeof item === 'object' && text(item.key));
    const statusSubjects = Object.keys(object(input.statusSubjects)).filter(Boolean);
    const validSubjects = new Set(npcNames);
    if (!input.worldMode && text(input.name)) validSubjects.add(text(input.name));
    const detachedSubjects = statusSubjects.filter(name => !validSubjects.has(name));
    const hasProfile = Boolean(text(input.profile));
    const hasWorld = Boolean(text(input.world));
    const hasLore = Boolean(text(input.lore));
    const uiKinds = [
      input.phoneEnabled && '手機',
      input.dialogueEnabled && '頭像對話',
      input.gameplayEnabled && '互動面板'
    ].filter(Boolean);

    return Object.freeze({
      structuredWorld: npcs.length > 0 || statusFields.length > 0 || statusSubjects.length > 0,
      areas: Object.freeze({
        people: Object.freeze({
          key: hasProfile || npcs.length ? 'configured' : 'empty',
          tone: hasProfile || npcs.length ? 'good' : 'neutral',
          label: [hasProfile ? '主要角色已設定' : '', npcs.length ? npcs.length + ' 位初始 NPC' : ''].filter(Boolean).join(' · ') || '尚未補充人物資料',
          detail: '主要角色描述作品主體；初始 NPC 名冊描述故事開始時已存在的人物。'
        }),
        world: Object.freeze({
          key: hasWorld || hasLore ? 'configured' : 'empty',
          tone: hasWorld || hasLore ? 'good' : 'neutral',
          label: [hasWorld ? '世界規則' : '', hasLore ? '背景／按需世界書' : ''].filter(Boolean).join(' ＋ ') || '尚未補充世界資料',
          detail: '世界規則預設常駐；按需世界書只在關鍵字或目前位置相關時載入。'
        }),
        status: Object.freeze({
          key: statusFields.length ? (detachedSubjects.length ? 'review' : 'configured') : 'empty',
          tone: detachedSubjects.length ? 'warn' : statusFields.length ? 'good' : 'neutral',
          label: statusFields.length
            ? statusFields.length + ' 個欄位 · ' + statusSubjects.length + ' 位人物初始值'
            : '尚未設定人物數值',
          detail: detachedSubjects.length
            ? detachedSubjects.length + ' 位初始值未對應目前名冊；資料會保留，可用 BAO Doctor 核對。'
            : '數值只追蹤會改變的狀態，不取代人物性格、關係文字或世界書。'
        }),
        ui: Object.freeze({
          key: uiKinds.length ? 'configured' : 'empty',
          tone: uiKinds.length ? 'good' : 'neutral',
          label: uiKinds.length ? uiKinds.join(' · ') : '沿用夜灣原生閱讀介面',
          detail: '互動 UI 只決定玩家如何看見與操作，不會建立另一份人物或故事狀態。'
        })
      }),
      counts: Object.freeze({
        npcs: npcs.length,
        statusFields: statusFields.length,
        statusSubjects: statusSubjects.length,
        detachedSubjects: detachedSubjects.length,
        uiKinds: uiKinds.length
      })
    });
  }

  return Object.freeze({ derive });
});
