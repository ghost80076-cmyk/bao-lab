/* Per-card author Regex MOD studio. Display layer only: never edits prompts, Chat.messages, memory or saves. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  const AppRef = window.App || (typeof App !== 'undefined' ? App : null);
  if (!Core || !AppRef) return;

  const PREFIX = 'bao-lab:author-regex:v1:';
  const MAX_RULES = Core.LIMIT || 60;
  let host = null;
  let ruleList = null;
  let status = null;
  let draft = [];
  let owner = '';

  const cardId = () => String(AppRef.activeCharacter?.id || '').slice(0, 80);
  const key = id => PREFIX + encodeURIComponent(id);
  const emptyConfig = () => ({
    enabled: false,
    allowScripts: false,
    allowExternalAssets: false,
    allowStateSharing: false,
    allowUiPersistence: false,
    rules: []
  });

  function loadConfig(id) {
    try {
      const raw = JSON.parse(localStorage.getItem(key(id)) || 'null');
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rules)) return emptyConfig();
      return {
        ...emptyConfig(),
        ...raw,
        rules: Core.normalize(raw.rules)
      };
    } catch (_) {
      return emptyConfig();
    }
  }

  function saveConfig(id, rules) {
    const current = loadConfig(id);
    current.rules = Core.normalize(rules);
    localStorage.setItem(key(id), JSON.stringify(current));
    window.BAOAuthorInline?.refresh?.();
    window.BAOAuthorDock?.refresh?.();
    window.dispatchEvent(new CustomEvent('bao:author-regex-changed', { detail: { characterId: id } }));
    return current;
  }

  function say(message, tone = '') {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function makeField(labelText, element, hint = '') {
    const label = document.createElement('label');
    label.style.cssText = 'display:grid;gap:5px;font-size:12px';
    const labelTextNode = document.createElement('span');
    labelTextNode.textContent = labelText;
    labelTextNode.style.fontWeight = '600';
    label.append(labelTextNode, element);
    if (hint) {
      const small = document.createElement('small');
      small.textContent = hint;
      small.style.cssText = 'opacity:.78;line-height:1.5';
      label.append(small);
    }
    return label;
  }

  function input(value = '', type = 'text') {
    const el = document.createElement('input');
    el.type = type;
    el.value = String(value ?? '');
    el.style.cssText = 'width:100%;box-sizing:border-box';
    return el;
  }

  function textarea(value = '') {
    const el = document.createElement('textarea');
    el.value = String(value ?? '');
    el.rows = 4;
    el.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;min-height:84px';
    return el;
  }

  function updateDraft(index, patch) {
    draft[index] = { ...draft[index], ...patch };
  }

  function renderRules() {
    if (!ruleList) return;
    ruleList.replaceChildren();
    if (!draft.length) {
      const empty = document.createElement('p');
      empty.textContent = '目前沒有手動規則。可以新增一條，或使用上方的「匯入正則 JSON」。';
      empty.style.cssText = 'font-size:12px;opacity:.78;line-height:1.6';
      ruleList.append(empty);
      return;
    }

    draft.forEach((rule, index) => {
      const card = document.createElement('section');
      card.className = 'bao-author-regex-rule';
      card.style.cssText = 'display:grid;gap:9px;padding:11px;margin:9px 0;border:1px solid #725c78;border-radius:10px;background:#15131d';

      const top = document.createElement('div');
      top.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap';

      const enabledLabel = document.createElement('label');
      enabledLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px';
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = rule.enabled !== false;
      enabled.addEventListener('change', () => updateDraft(index, { enabled: enabled.checked }));
      enabledLabel.append(enabled, document.createTextNode('啟用'));

      const stage = document.createElement('span');
      stage.textContent = 'AI 回覆顯示層';
      stage.title = '只改畫面顯示，不修改模型輸入、故事原文、記憶或狀態';
      stage.style.cssText = 'font-size:11px;padding:3px 7px;border:1px solid #725c78;border-radius:999px;opacity:.82';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '移除';
      remove.style.cssText = 'width:auto;padding:5px 8px;font-size:12px';
      remove.addEventListener('click', () => {
        draft.splice(index, 1);
        renderRules();
        say('已從草稿移除；按「儲存 Regex MOD」後才會寫入本機。');
      });

      top.append(enabledLabel, stage, remove);
      card.append(top);

      const name = input(rule.name || `規則 ${index + 1}`);
      name.addEventListener('input', () => updateDraft(index, { name: name.value }));
      card.append(makeField('名稱', name));

      const description = input(rule.description || '');
      description.maxLength = 240;
      description.placeholder = '可選：這條規則想做什麼';
      description.addEventListener('input', () => updateDraft(index, { description: description.value }));
      card.append(makeField('說明', description));

      const pattern = input(rule.pattern || '');
      pattern.placeholder = '例如：NPC:';
      pattern.addEventListener('input', () => updateDraft(index, { pattern: pattern.value }));
      card.append(makeField('Find / 正則比對式', pattern, 'JavaScript RegExp。規則只會處理目前 AI 回覆的顯示文字。'));

      const replacement = textarea(rule.replacement || '');
      replacement.placeholder = '替換文字；可使用 $1、$2 等捕獲組。HTML/CSS 會走隔離 iframe；腳本需玩家另行授權。';
      replacement.addEventListener('input', () => updateDraft(index, { replacement: replacement.value }));
      card.append(makeField('Replace / 替換內容', replacement));

      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:minmax(100px,1fr) minmax(100px,1fr);gap:8px';

      const flags = input(rule.flags || 'g');
      flags.placeholder = 'g / gi / gm';
      flags.addEventListener('input', () => updateDraft(index, { flags: flags.value }));
      row.append(makeField('Flags', flags));

      const priority = input(Number(rule.priority) || 0, 'number');
      priority.min = '-100';
      priority.max = '100';
      priority.step = '1';
      priority.addEventListener('input', () => updateDraft(index, { priority: Number(priority.value) || 0 }));
      row.append(makeField('優先序', priority, '數字越大越先執行；同分維持原順序。'));
      card.append(row);

      if (rule.reason) {
        const warning = document.createElement('small');
        warning.textContent = '目前規則檢查：' + rule.reason;
        warning.style.cssText = 'color:#ffd0a9;line-height:1.5';
        card.append(warning);
      }

      ruleList.append(card);
    });
  }

  function reloadDraft() {
    const id = cardId();
    if (!id) {
      owner = '';
      draft = [];
      renderRules();
      say('請先進入一張角色卡的故事。');
      return;
    }
    owner = id;
    draft = loadConfig(id).rules.map(rule => ({ ...rule }));
    renderRules();
    say(`目前編輯 ${draft.length} 條規則。所有規則都只作用在前端顯示層。`);
  }

  function addRule() {
    if (!owner || owner !== cardId()) reloadDraft();
    if (!owner) return;
    if (draft.length >= MAX_RULES) {
      say(`每張角色卡最多 ${MAX_RULES} 條 Regex MOD。`, 'error');
      return;
    }
    draft.push({
      name: `新規則 ${draft.length + 1}`,
      description: '',
      pattern: '',
      replacement: '',
      flags: 'g',
      priority: 0,
      scope: 'assistant_display',
      enabled: false
    });
    renderRules();
    ruleList?.lastElementChild?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    say('已新增草稿規則；填寫後按「儲存 Regex MOD」。');
  }

  function saveDraft() {
    const id = cardId();
    if (!id || id !== owner) {
      reloadDraft();
      say('故事已切換，請重新確認規則後再儲存。', 'error');
      return;
    }
    let normalized;
    try {
      normalized = Core.normalize(draft);
    } catch (error) {
      say('規則無法儲存：' + (error.message || error), 'error');
      return;
    }
    const invalidEnabled = normalized.find(rule => rule.enabled && rule.reason);
    if (invalidEnabled) {
      say(`「${invalidEnabled.name}」無法啟用：${invalidEnabled.reason}`, 'error');
      draft = normalized.map(rule => ({ ...rule }));
      renderRules();
      return;
    }
    const config = saveConfig(id, normalized);
    draft = config.rules.map(rule => ({ ...rule }));
    renderRules();
    say(`✓ 已儲存 ${draft.length} 條 Regex MOD。只會改變畫面，不會寫回模型或故事。`, 'ok');
  }

  function exportRules() {
    const id = cardId();
    if (!id || id !== owner) reloadDraft();
    if (!owner) return;
    const payload = {
      version: 1,
      type: 'yorubay-author-regex-mod',
      scope: 'assistant_display',
      characterId: owner,
      rules: Core.normalize(draft)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yorubay-regex-mod-${owner.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'character'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('✓ 已匯出目前規則草稿；不包含 API Key、聊天內容或故事存檔。');
  }

  function mount() {
    const panel = document.getElementById('bao-author-regex-panel');
    if (!panel) return false;
    if (document.getElementById('bao-author-regex-studio')) {
      host = document.getElementById('bao-author-regex-studio');
      ruleList = host.querySelector('[data-regex-studio-rules]');
      status = host.querySelector('[data-regex-studio-status]');
      if (owner !== cardId()) reloadDraft();
      return true;
    }

    host = document.createElement('section');
    host.id = 'bao-author-regex-studio';
    host.style.cssText = 'margin-top:10px;padding:10px;border:1px solid #725c78;border-radius:10px;background:#17131c';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Regex MOD 工作室 · 手動建立規則';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.style.cssText = 'width:100%;text-align:left;font-weight:600;background:transparent;border:0;color:inherit;padding:2px 0;cursor:pointer';

    const body = document.createElement('div');
    body.hidden = true;
    body.dataset.regexStudioBody = '1';

    const intro = document.createElement('p');
    intro.textContent = '作者可以為目前角色卡建立自己的 Regex MOD。固定作用在 AI 回覆的「顯示層」：不改 Prompt、不改 Chat.messages、不改記憶、Canon、狀態或備份原文。';
    intro.style.cssText = 'font-size:12px;line-height:1.65;opacity:.86';

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap;margin:8px 0';

    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '＋ 新增規則';
    add.style.width = 'auto';
    add.addEventListener('click', addRule);

    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '儲存 Regex MOD';
    save.style.width = 'auto';
    save.addEventListener('click', saveDraft);

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = '重新載入';
    reload.style.width = 'auto';
    reload.addEventListener('click', reloadDraft);

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = '匯出 JSON';
    exportButton.style.width = 'auto';
    exportButton.addEventListener('click', exportRules);

    buttons.append(add, save, reload, exportButton);

    ruleList = document.createElement('div');
    ruleList.dataset.regexStudioRules = '1';

    status = document.createElement('p');
    status.dataset.regexStudioStatus = '1';
    status.setAttribute('role', 'status');
    status.style.cssText = 'font-size:12px;line-height:1.6;overflow-wrap:anywhere';

    body.append(intro, buttons, ruleList, status);
    host.append(toggle, body);
    panel.append(host);
    toggle.addEventListener('click', () => {
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
      if (!body.hidden && owner !== cardId()) reloadDraft();
    });
    reloadDraft();
    return true;
  }

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const renderShell = AppRef.renderChatShell?.bind(AppRef);
  if (renderShell) {
    AppRef.renderChatShell = function(...args) {
      const result = renderShell(...args);
      queueMicrotask(() => { mount(); if (owner !== cardId()) reloadDraft(); });
      return result;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  } else {
    mount();
  }

  window.BAOAuthorRegexStudio = Object.freeze({
    reload: reloadDraft,
    getDraft: () => draft.map(rule => ({ ...rule }))
  });
})();
