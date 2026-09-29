/* Per-character plain-text Regex MOD editor. Display layer only; never edits prompts, story state or API payloads. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  if (!Core || !window.App) return;

  const PREFIX = 'bao-lab:author-regex:v1:';
  const LIMIT = Core.LIMIT || 60;
  const cardId = () => String(App.activeCharacter?.id || '').slice(0, 80);
  const key = id => PREFIX + encodeURIComponent(id);
  const empty = () => ({
    enabled: false,
    allowScripts: false,
    allowExternalAssets: false,
    allowStateSharing: false,
    allowUiPersistence: false,
    rules: []
  });

  function load(id) {
    try {
      const raw = JSON.parse(localStorage.getItem(key(id)) || 'null');
      if (!raw || !Array.isArray(raw.rules)) return empty();
      return {
        ...empty(),
        ...raw,
        rules: Core.normalize(raw.rules)
      };
    } catch (_) {
      return empty();
    }
  }

  function save(id, state) {
    localStorage.setItem(key(id), JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('bao:author-regex-changed', { detail: { cardId: id } }));
  }

  const plainRule = (rule, index) => ({
    name: String(rule?.name || `文字 MOD ${index + 1}`).slice(0, 80),
    description: String(rule?.description || '').slice(0, 240),
    priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : 0,
    pattern: String(rule?.pattern || ''),
    replacement: String(rule?.replacement || ''),
    flags: String(rule?.flags || 'g'),
    enabled: rule?.enabled === true
  });

  function mount() {
    const panel = document.getElementById('bao-author-regex-panel');
    if (!panel || panel.querySelector('[data-bao-text-regex-mod]')) return;

    const root = document.createElement('details');
    root.dataset.baoTextRegexMod = '1';
    root.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px dashed #7c637f';

    const summary = document.createElement('summary');
    summary.textContent = '作品文字 Regex MOD';
    summary.style.cssText = 'cursor:pointer;font-weight:700';

    const intro = document.createElement('p');
    intro.style.cssText = 'font-size:12px;line-height:1.6';
    intro.textContent = '每張作品各自保存。只改 AI 回覆的前端顯示，不改原始故事、記憶、狀態、Prompt 或 API 請求。進階 HTML／CSS／腳本規則仍請使用 JSON 匯入。';

    const stage = document.createElement('small');
    stage.style.cssText = 'display:block;margin:6px 0 10px;opacity:.82';
    stage.textContent = '套用階段：AI 回覆顯示層（固定）';

    const list = document.createElement('div');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.style.cssText = 'font-size:12px;line-height:1.55;min-height:1.4em';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0';

    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '＋ 新增文字 MOD';

    const commit = document.createElement('button');
    commit.type = 'button';
    commit.textContent = '儲存 MOD';

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = '匯出 JSON';

    controls.append(add, commit, exportButton);
    root.append(summary, intro, stage, controls, list, status);
    panel.append(root);

    let draft = [];

    const say = value => { status.textContent = value; };

    function render() {
      list.replaceChildren();
      if (!draft.length) {
        const emptyNote = document.createElement('small');
        emptyNote.textContent = '目前沒有手動文字 MOD。';
        list.append(emptyNote);
        return;
      }

      draft.forEach((rule, index) => {
        const card = document.createElement('div');
        card.style.cssText = 'display:grid;gap:7px;margin:9px 0;padding:10px;border:1px solid #6d5872;border-radius:9px';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';

        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = rule.enabled === true;
        enabled.addEventListener('change', () => { rule.enabled = enabled.checked; });

        const label = document.createElement('strong');
        label.textContent = rule.name || `文字 MOD ${index + 1}`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '移除';
        remove.addEventListener('click', () => {
          draft.splice(index, 1);
          render();
        });

        head.append(enabled, label, remove);
        card.append(head);

        const make = (title, value, onInput, multiline = false, inputType = 'text') => {
          const wrap = document.createElement('label');
          const cap = document.createElement('span');
          cap.textContent = title;
          cap.style.cssText = 'display:block;font-size:12px;margin-bottom:4px';
          const input = multiline ? document.createElement('textarea') : document.createElement('input');
          if (!multiline) input.type = inputType;
          input.value = value;
          input.style.cssText = multiline
            ? 'width:100%;min-height:64px;box-sizing:border-box'
            : 'width:100%;box-sizing:border-box';
          input.addEventListener('input', () => onInput(input.value));
          wrap.append(cap, input);
          return wrap;
        };

        card.append(
          make('名稱', rule.name, value => {
            rule.name = value.slice(0, 80);
            label.textContent = rule.name || `文字 MOD ${index + 1}`;
          }),
          make('說明', rule.description || '', value => { rule.description = value.slice(0, 240); }),
          make('優先序（-100～100，越大越先）', rule.priority ?? 0, value => { rule.priority = Number(value) || 0; }, false, 'number'),
          make('Regex 比對式', rule.pattern, value => { rule.pattern = value; }),
          make('旗標', rule.flags || 'g', value => { rule.flags = value; }),
          make('替換文字', rule.replacement, value => { rule.replacement = value; }, true)
        );

        if (rule.rich || rule.script) {
          const note = document.createElement('small');
          note.textContent = '這是進階介面規則，文字 MOD 編輯器不會修改它。';
          note.style.cssText = 'color:#f0c9a8';
          card.append(note);
        }

        list.append(card);
      });
    }

    function reload() {
      const id = cardId();
      if (!id) {
        draft = [];
        render();
        say('請先進入一張作品。');
        return;
      }
      const state = load(id);
      draft = state.rules.map((rule, index) => rule.rich || rule.script
        ? { ...rule, __locked: true }
        : plainRule(rule, index));
      render();
      const editable = draft.filter(rule => !rule.__locked).length;
      say(`目前 ${editable} 條文字 MOD；另有 ${draft.length - editable} 條進階規則。`);
    }

    add.addEventListener('click', () => {
      if (draft.length >= LIMIT) {
        say(`最多 ${LIMIT} 條規則，請先移除不需要的項目。`);
        return;
      }
      draft.push({ name: `文字 MOD ${draft.length + 1}`, description: '', priority: 0, pattern: '', replacement: '', flags: 'g', enabled: false });
      render();
    });

    exportButton.addEventListener('click', () => {
      const id = cardId();
      if (!id) { say('請先進入一張作品。'); return; }
      const payload = {
        version: 1,
        type: 'yorubay-author-regex-mod',
        scope: 'assistant_display',
        characterId: id,
        rules: Core.normalize(draft)
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `yorubay-regex-mod-${id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'character'}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say('✓ 已匯出目前 Regex MOD 草稿；不包含 API Key、聊天內容或故事存檔。');
    });

    commit.addEventListener('click', () => {
      const id = cardId();
      if (!id) { say('請先進入一張作品。'); return; }
      const current = load(id);
      const nextRules = [];
      for (let index = 0; index < draft.length; index++) {
        const item = draft[index];
        if (item.__locked) {
          nextRules.push(item);
          continue;
        }
        const normalized = Core.normalize([plainRule(item, index)])[0];
        if (item.enabled && normalized.reason) {
          say(`第 ${index + 1} 條無法啟用：${normalized.reason}`);
          return;
        }
        nextRules.push(normalized);
      }
      const next = { ...current, rules: nextRules };
      save(id, next);
      draft = nextRules.map((rule, index) => rule.rich || rule.script
        ? { ...rule, __locked: true }
        : plainRule(rule, index));
      render();
      say('✓ 已儲存這張作品的文字 Regex MOD；不會改寫故事原文或送進模型。');
      window.BAOAuthorInline?.refresh?.();
    });

    root.addEventListener('toggle', () => { if (root.open) reload(); });
    window.addEventListener('bao:author-regex-changed', event => {
      if (event.detail?.cardId === cardId() && root.open) reload();
    });
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.BAOAuthorTextRegexMod = { mount };
})();
