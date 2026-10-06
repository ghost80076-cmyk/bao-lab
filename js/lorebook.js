/* Opt-in, keyword-triggered lore in the existing text field. Legacy text stays intact. */
(() => {
  'use strict';
  const engine = typeof CharacterEngine !== 'undefined' ? CharacterEngine : window.CharacterEngine;
  if (!engine || engine.__baoLorebookPatched) return;
  const entryPattern = /【世界書：([^｜】\n]{1,60})｜([^】\n]{1,200})】\s*([\s\S]*?)【\/世界書】/g;
  const parse = input => {
    const entries = [];
    const fixed = String(input || '').replace(entryPattern, (whole, label, triggerList, body) => {
      const triggers = [...new Set(triggerList.split(/[,，、;；|｜]+/).map(s => s.trim().toLocaleLowerCase()).filter(Boolean))].slice(0, 16);
      const text = body.trim();
      if (!triggers.length || !text || entries.length >= 32) return whole;
      entries.push({ label: label.trim(), triggers, text });
      return '';
    }).trim();
    return { fixed, entries };
  };
  const select = (entries, context = {}) => {
    const recent = Array.isArray(context.recentMessages) ? context.recentMessages : [];
    const latestUser = [...recent].reverse().find(m => m?.role === 'user')?.content || context.latestUserText || '';
    const lastReply = [...recent].reverse().find(m => m?.role === 'assistant')?.content || '';
    const state = window.GameState?.current || {};
    const location = String(state.location || '');
    const presentNPCs = (Array.isArray(state.npcs) ? state.npcs : [])
      .filter(npc => npc?.presence === 'present')
      .map(npc => [npc.name, npc.role, npc.location].filter(Boolean).join(' '))
      .join('\n');
    const recentEvents = (Array.isArray(state.events) ? state.events : [])
      .slice(0, 8)
      .map(event => typeof event === 'string' ? event : event?.text || '')
      .filter(Boolean)
      .join('\n');
    const signals = [
      { text: latestUser, weight: 180 },
      { text: presentNPCs, weight: 140 },
      { text: location, weight: 120 },
      { text: recentEvents, weight: 70 },
      { text: lastReply, weight: 30 }
    ].map(signal => ({ ...signal, text: String(signal.text || '').toLocaleLowerCase() }));
    let budget = 0;
    return entries.map((entry, index) => {
      let score = 0;
      entry.triggers.forEach(trigger => {
        signals.forEach(signal => {
          if (signal.text.includes(trigger)) score = Math.max(score, signal.weight + trigger.length);
        });
      });
      return { ...entry, score, index };
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index)
      .filter(entry => {
        if (budget + entry.text.length > 10000 && budget > 0) return false;
        budget += entry.text.length;
        return true;
      }).slice(0, 3);
  };
  const original = engine.composeSystemPrompt;
  engine.composeSystemPrompt = function(character, context = {}) {
    const c = this.normalize(character || {});
    if (c.prompt_options?.include_lore === false || typeof c.lore !== 'string' || !c.lore.includes('【世界書：')) {
      return original.call(this, c, context);
    }
    const { fixed, entries } = parse(c.lore);
    const base = original.call(this, { ...c, lore: fixed }, context);
    const relevant = select(entries, context);
    if (!relevant.length) return base;
    return base + '\n\n【本輪相關世界書】\n' + relevant.map(entry => `【${entry.label}】\n${entry.text}`).join('\n\n') + '\n僅在情境相關時使用上述背景，不要為了帶入設定而強行改變劇情。';
  };
  engine.__baoLorebookPatched = true;
  window.BAOLorebook = { parse, select };

  const initStudio = () => {
    const area = document.querySelector('#studio-form textarea[name="lore"]');
    const add = document.getElementById('studio-add-lore-entry');
    const hint = document.getElementById('studio-lore-status');
    if (!area || !add || !hint) return;

    const label = area.closest('label');
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.textContent = '延伸世界設定（需要時才讀取）';
    area.placeholder = '人物、地點、組織或事件的詳細資料，可以用下方「＋ 新增一筆延伸設定」建立。固定每輪都要讓 AI 知道的基本規則，請寫在上方「世界設定」。';
    const loreHelp = label?.querySelector('small');
    if (loreHelp) loreHelp.textContent = '這裡也叫「世界書 / Lorebook」。平常不會一直把每筆延伸設定送給 AI；故事提到設定的關鍵字時，夜灣才會自動帶入相關內容。舊角色卡的一般背景文字仍會照原本方式使用。';
    add.textContent = '＋ 新增一筆延伸設定';
    add.title = '建立人物、地點、組織或事件的詳細設定；故事提到關鍵字時才提供給 AI';

    const profile = document.querySelector('#studio-form textarea[name="profile"]');
    const profileHelp = profile?.closest('label')?.querySelector('small');
    if (profileHelp) profileHelp.textContent = '單角色作品可放主要角色資料；多 NPC 世界只放固定主角或作品主體。其他人物、地點與組織的詳細資料，建議放在下方「延伸世界設定」。';
    const world = document.querySelector('#studio-form textarea[name="world"]');
    const worldHelp = world?.closest('label')?.querySelector('small');
    if (worldHelp) worldHelp.textContent = '放這個世界每次都要記得的基本規則，例如時代、社會制度、力量體系。這裡會每輪提供給 AI；人物或地點的長篇細節建議改放「延伸世界設定」。';

    const update = () => {
      const result = parse(area.value);
      const unclosed = (area.value.match(/【世界書：/g) || []).length - result.entries.length;
      hint.textContent = unclosed > 0
        ? `已建立 ${result.entries.length} 筆需要時才讀取的設定；另有 ${unclosed} 筆格式尚未完成。`
        : `已建立 ${result.entries.length} 筆延伸設定。故事提到設定的關鍵字時，夜灣才會把相關內容提供給 AI。`;
    };
    add.addEventListener('click', () => {
      const title = window.prompt('這筆設定叫什麼？\n只是方便你辨認，例如：魔法學院、王都、林老師。', '魔法學院');
      if (title === null) return;
      const cleanTitle = title.trim().slice(0, 60);
      if (!cleanTitle) return;
      const keywords = window.prompt('故事出現哪些詞時，要讓 AI 想起這筆設定？\n可用逗號分隔，例如：魔法學院,學院,校長', cleanTitle);
      if (keywords === null) return;
      const cleanKeywords = keywords.trim().slice(0, 200);
      if (!cleanKeywords) return;
      const body = window.prompt('AI 需要知道什麼？\n寫下人物、地點、組織或事件的詳細設定。', '請在這裡填寫詳細設定。');
      if (body === null) return;
      const cleanBody = body.trim();
      if (!cleanBody) return;
      area.value += `\n\n【世界書：${cleanTitle}｜${cleanKeywords}】\n${cleanBody}\n【/世界書】`;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.focus();
    });
    area.addEventListener('input', update);
    document.getElementById('studio-form')?.addEventListener('change', update);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(update).observe(document.getElementById('studio-status'), { childList: true, characterData: true, subtree: true });
    }
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStudio, { once: true });
  else initStudio();
})();
