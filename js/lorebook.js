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
      if (!triggers.length || !text || entries.length >= 32) return whole; // Never discard unparsed content.
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

  // The studio keeps using the existing lore text field, exports and local drafts.
  const initStudio = () => {
    const area = document.querySelector('#studio-form textarea[name="lore"]');
    const add = document.getElementById('studio-add-lore-entry');
    const hint = document.getElementById('studio-lore-status');
    if (!area || !add || !hint) return;
    const update = () => {
      const result = parse(area.value);
      const unclosed = (area.value.match(/【世界書：/g) || []).length - result.entries.length;
      hint.textContent = unclosed > 0
        ? `已辨識 ${result.entries.length} 條按需資料；另有 ${unclosed} 條格式未完成，未辨識的文字仍會每輪發送。`
        : `已辨識 ${result.entries.length} 條按需資料；未包在世界書標記內的文字仍會每輪發送。`;
    };
    add.addEventListener('click', () => {
      const title = '新地點';
      const sample = `\n\n【世界書：${title}｜${title},別稱】\n請填寫與這個地點、人物或勢力有關的資料。\n【/世界書】`;
      area.value += sample;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.focus();
      const start = area.value.lastIndexOf(title);
      if (start >= 0) area.setSelectionRange(start, start + title.length);
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
