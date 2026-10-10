(function(root, factory) {
  const profiles = typeof module === 'object' && module.exports ? require('./three-realms-event-profiles.js') : root?.BAOThreeRealmsEventProfiles || [];
  const api = factory(profiles);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOThreeRealmsEventsCore = api;
})(typeof window === 'undefined' ? null : window, function(profiles) {
  'use strict';
  const id = 'three_realms_events';
  const MAX_PROMPT = 1800;
  const preset = {
    label: '三界事件與角色引導', icon: '✧', tracking: 'manual', context: 'ui_only', kind: 'object', fields: [],
    triggers: [], description: '啟用後，在快捷指令選擇機運、危機、探索等事件或角色構思；明確送出要求才引導本輪敘事，沿用主模型。'
  };
  const commands = profiles.map(p => ({ id: 'three-realms-' + p.id, label: p.label, text: '【' + p.label + '】', source: p.category || 'event' }));
  function requested(text = '') {
    const value = String(text).trim();
    const exact = profiles.find(p => p.aliases.includes(value));
    if (exact) return exact;
    const visible = value.replace(/```[\s\S]*?(?:```|$)/g, '');
    for (const line of visible.split(/\r?\n/)) {
      const match = profiles.find(p => p.aliases.some(alias => line.trim() === '【' + alias + '】'));
      if (match) return match;
    }
    return null;
  }
  function buildPrompt({ enabled = false, latestUser = '', route = '' } = {}) {
    if (!enabled) return '';
    const profile = requested(latestUser);
    if (!profile) return '';
    const realm = String(route).startsWith('下界') ? '下界' : ['中界', '上界'].includes(route) ? route : '';
    const blocks = [
      '【三界事件引導｜' + profile.label + '】',
      '本輪玩家明確要求的敘事手法，服從作品設定、已確認事實與平台規則。',
      (profile.id === 'crossover-npc' ? '' : '設計') + profile.goal + '。原文節奏：' + profile.steps.join(' → ') + '。依情境只推進到當輪合理停點，不必一輪走完六步。',
      '可選類型：' + profile.types.join('、') + '。',
      realm ? '已確認所在：' + realm + '。場景靈感（不是已發生事實）：\n' + profile.realms[realm] : '所在界域未確認，使用目前作品已建立的境界與場景，不自行選定下界／中界／上界。',
      '原文設計細節：\n' + profile.notes,
      (profile.category === 'generator' ? '依玩家要求提供角色設定或本輪出場。' : '只寫本輪故事。') + '不另輸出導演報告或來源步驟標籤。選項保持開放；玩家決策與未發生結果保持未定。這些靈感不直接成為任務、名冊、背包、突破成功或時鐘更新。',
      profile.details ? '角色構思欄位：\n' + profile.steps.map((step, i) => step + '：\n' + profile.details[i]).join('\n') : '',
      profile.category === 'generator' ? '構思具有背景、外貌、性格、能力來源、目標與關係張力的角色，按玩家要求呈現設定或自然出場。角色構思不直接建立名冊、不替換玩家身份、不自行授予玩家能力或物品；留待實際故事互動。' : '',
      profile.id === 'crossover-npc' ? '只融合玩家明確指定的作品與角色。若姓名、作品或版本不明且現有對話無法確認，先詢問，不自行選定角色；未確認的原作資料保持未定。保留其核心性格與能力特色，依當前作品的境界體系適配。' : '',
      profile.id === 'breakthrough' ? '突破意圖、契機及準備不等於成功；以目前故事選用的境界體系和已有積累為準，結果成立後由既有修煉追蹤處理。' : '',
      profile.id === 'time' ? '先依玩家指定的跨度；未指定時停在時間推進的選擇點，不自行跳過數十年。只有正文確實流逝的時間交給既有世界時鐘。' : ''
    ].filter(Boolean);
    const prompt = blocks.join('\n');
    if (prompt.length > MAX_PROMPT) throw new Error('三界事件提示超過預算。');
    return prompt;
  }
  function append(messages, options) {
    const prompt = buildPrompt(options);
    if (!prompt || !Array.isArray(messages)) return messages;
    // One transient instruction beside the current user turn; stable prefix stays intact.
    if (messages.some(m => m?.role === 'system' && m.content === prompt)) return messages;
    const result = messages.map(m => ({ ...m }));
    let index = -1;
    for (let n = result.length - 1; n >= 0; n--) if (result[n]?.role === 'user') { index = n; break; }
    if (index < 0) return messages;
    result.splice(index, 0, { role: 'system', content: prompt });
    return result;
  }
  return Object.freeze({ id, profiles, preset, commands, MAX_PROMPT, requested, buildPrompt, append });
});
