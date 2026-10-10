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
    label: '三界故事引導', icon: '✧', tracking: 'manual', context: 'ui_only', kind: 'object', fields: [],
    triggers: [], description: '啟用後，在快捷指令選擇機運、危機、探索等事件、角色構思、查詢整理或世界構思；明確送出要求才引導本輪敘事，沿用主模型。'
  };
  const commands = profiles.map(p => ({ id: 'three-realms-' + p.id, label: p.label, text: p.command || '【' + p.label + '】', source: p.category || 'event' }));
  function requested(text = '') {
    const raw = String(text).replace(/\r\n?/g, '\n');
    const value = raw.trim();
    const first = raw.split('\n').find(line => line.trim()) || '';
    const indented = line => /^(?: {4}|\t)/.test(line);
    const exact = !indented(first) && profiles.find(p => p.aliases.includes(value));
    if (exact) return exact;
    let fence = null;
    for (const line of raw.split('\n')) {
      if (fence) {
        if (new RegExp('^ {0,3}' + fence.char + '{' + fence.length + ',}\\s*$').test(line)) fence = null;
        continue;
      }
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
        fence = { char: opening[1][0], length: opening[1].length };
        continue;
      }
      if (indented(line)) continue;
      const match = profiles.find(p => p.aliases.some(alias => line.trim() === '【' + alias + '】' || (p.category === 'query' && alias.startsWith('【系統指令】') && line.trim() === alias)));
      if (match) return match;
      const legacy = profiles.find(p => p.category === 'workshop' && p.legacy_pattern && new RegExp(p.legacy_pattern).test(line.trim()));
      if (legacy) return legacy;
    }
    return null;
  }
  function buildPrompt({ enabled = false, latestUser = '', route = '' } = {}) {
    if (!enabled) return '';
    const profile = requested(latestUser);
    if (!profile) return '';
    if (profile.category === 'workshop') {
      const prompt = [
        '【三界世界構思｜' + profile.label + '】',
        '本輪玩家明確要求世界設計方案，只構思，不直接修改存檔或宣稱已套用。服從玩家指定的作品、人物核心與現有已確認事實。',
        '依需求選用來源分類：' + profile.layout.join('、') + '。角色的新身份、背景、力量與規則須標為提案，不寫成既有角色已被更改。',
        profile.guidance || '',
        profile.id === 'workshop-fusion' ? '先確認玩家要融合的兩個世界與版本；對象不足先詢問。提出兩邊保留元素、交互方式、規則衝突與處理選項，不自行把互不相容的境界梯度視為同一套。' : '',
        profile.id === 'workshop-custom' ? '先依玩家提供的描述整理類型、背景、基調、核心元素、規則與劇情方向；描述缺失先詢問。不替玩家指定未要求的身份或關係。' : '',
        profile.id === 'workshop-switch' ? '先確認目標世界與是否保留角色、劇情及資源，提出保留、轉換、重置或融合的可選方案；未說明的資料保持原狀。' : '',
        '列出需要玩家選擇或調整的事項，停在方案討論。原文的確認是設計確認，不是可執行的重置授權；這個指令沒有修改故事資料的工具。即使玩家確認，仍不能宣稱存檔、世界模組或角色已自動切換。'
      ].filter(Boolean).join('\n');
      if (prompt.length > MAX_PROMPT) throw new Error('三界世界構思提示超過預算。');
      return prompt;
    }
    if (profile.category === 'query') {
      const prompt = [
        '【三界查詢整理｜' + profile.label + '】',
        '玩家明確要求整理本故事資訊，沿用當前作品與已確認的對話、存檔資料。只使用已知事實；缺失資訊標明未確認，不能替角色編造過往、物品、關係或能力。',
        '按玩家本輪需求採用原文的相關分類，不必輸出空白模板。參考分類：' + profile.layout.join('、') + '。',
        '未見人物、離場動態、可能發展與已發生事件必須區分；可能性不能寫成確定結果。回答以故事內姓名與資訊為主，不混入演員身份或來源模板。',
        '這是資訊整理，不推進時間、不建立新任務或物品、不改變角色關係，不自動切換或融合世界。正文與原生面板維持既有格式。'
      ].join('\n');
      if (prompt.length > MAX_PROMPT) throw new Error('三界查詢提示超過預算。');
      return prompt;
    }
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
