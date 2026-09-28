/* Player-facing literal text replacement MOD. Story-scoped display layer only. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.BAOPlayerTextReplace = api;
    api.install(root);
  }
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';

  const MAX_RULES = 40;
  const MAX_FIND = 200;
  const MAX_REPLACE = 2000;
  const MAX_SOURCE = 30000;
  let host = null;

  const text = value => String(value ?? '');

  function normalizeRule(input = {}, index = 0) {
    const raw = input && typeof input === 'object' ? input : {};
    return {
      id: text(raw.id || `text-replace-${index + 1}`).slice(0, 80),
      find: text(raw.find).slice(0, MAX_FIND),
      replace: text(raw.replace).slice(0, MAX_REPLACE),
      enabled: raw.enabled !== false
    };
  }

  function normalizeState(input = {}) {
    const raw = input && typeof input === 'object' ? input : {};
    const rules = Array.isArray(raw.rules) ? raw.rules : [];
    const scope = raw.scope && typeof raw.scope === 'object' ? raw.scope : {};
    return {
      active: raw.active === true,
      scope: {
        chat: scope.chat !== false,
        status: scope.status === true
      },
      rules: rules.slice(0, MAX_RULES).map(normalizeRule)
    };
  }

  function apply(input, state, target = 'chat') {
    const original = text(input);
    if (original.length > MAX_SOURCE) return original;
    const normalized = normalizeState(state);
    if (!normalized.active || normalized.scope?.[target] !== true) return original;
    let result = original;
    for (const rule of normalized.rules) {
      if (!rule.enabled || !rule.find) continue;
      result = result.split(rule.find).join(rule.replace);
      if (result.length > MAX_SOURCE * 2) return original;
    }
    return result;
  }

  function current() {
    const story = host?.GameState?.current;
    if (!story) return normalizeState({});
    const normalized = normalizeState(story.playerTextReplaceMod);
    story.playerTextReplaceMod = normalized;
    return {
      active: normalized.active,
      scope: { ...normalized.scope },
      rules: normalized.rules.map(rule => ({ ...rule }))
    };
  }

  function write(next) {
    const story = host?.GameState?.current;
    if (!story) return normalizeState(next);
    const normalized = normalizeState(next);
    story.playerTextReplaceMod = normalized;
    host.App?.saveStory?.(false);
    try {
      host.dispatchEvent(new CustomEvent('bao:player-text-replace-changed'));
    } catch (_) {}
    host.BAORegexChat?.schedule?.();
    const activePanel = host.document?.querySelector?.('#game-ui .ui-tab.active')?.dataset?.panel;
    if (activePanel) host.App?.renderUIPanel?.(activePanel);
    return current();
  }

  function install(root) {
    host = root;
    const App = root.App;
    const GameState = root.GameState;
    const document = root.document;
    if (!App || !GameState || !document || App.__playerTextReplaceInstalled) return;
    App.__playerTextReplaceInstalled = true;

    const escape = value => App.escapeHTML ? App.escapeHTML(value) : text(value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[ch]));

    const close = () => document.querySelector('.bao-text-replace-backdrop')?.remove();

    const statusText = state => {
      const count = state.active ? state.rules.filter(rule => rule.enabled && rule.find).length : 0;
      return count ? `Aa 文字替換 · ${count}` : 'Aa 文字替換';
    };

    const updateButton = () => {
      const button = document.querySelector('[data-bao-open="text-replace"]');
      if (!button) return;
      const state = current();
      const count = state.active ? state.rules.filter(rule => rule.enabled && rule.find).length : 0;
      button.textContent = statusText(state);
      button.classList.toggle('is-active', count > 0);
      button.title = count ? `目前有 ${count} 條文字替換生效` : '目前沒有文字替換生效';
    };

    function open() {
      close();
      const draft = current();
      const wrap = document.createElement('div');
      wrap.className = 'bao-modal-backdrop bao-text-replace-backdrop';
      wrap.innerHTML = `<section class="bao-modal">
        <div class="bao-modal-head">
          <div><div class="eyebrow">PLAYER DISPLAY MOD</div><h2>文字替換 MOD</h2></div>
          <button class="bao-modal-close" type="button">關閉</button>
        </div>
        <div class="bao-modal-body">
          <div class="bao-setting-section">
            <h3>只改你看到的文字</h3>
            <p>AI 原始回覆、故事記憶、世界狀態與下一輪模型內容都不會被修改。關閉 MOD 後，畫面會重新顯示原文。</p>
            <label class="bao-toggle"><span><b>啟用文字替換</b><br><small class="note">多條規則會依目前順序由上往下套用。</small></span><input id="bao-text-replace-active" type="checkbox" ${draft.active ? 'checked' : ''}></label>
          </div>
          <div class="bao-setting-section">
            <h3>套用範圍</h3>
            <p>只替換顯示值，不修改狀態欄名稱、世界模組名稱或底層資料。</p>
            <div class="bao-choice-grid two">
              <label class="bao-toggle"><span><b>故事文字</b><br><small class="note">AI 回覆正文</small></span><input id="bao-text-replace-scope-chat" type="checkbox" ${draft.scope?.chat !== false ? 'checked' : ''}></label>
              <label class="bao-toggle"><span><b>狀態顯示</b><br><small class="note">人物狀態、時間地點、世界模組與 Gameplay UI 的值</small></span><input id="bao-text-replace-scope-status" type="checkbox" ${draft.scope?.status === true ? 'checked' : ''}></label>
            </div>
          </div>
          <div class="bao-setting-section">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
              <div><h3 style="margin-bottom:4px">替換規則</h3><small class="note">不需要懂 Regex；括號、問號、+ 等符號都只當普通文字。</small></div>
              <button type="button" class="secondary" data-text-replace-add>＋ 新增替換</button>
            </div>
            <div data-text-replace-list style="display:grid;gap:10px;margin-top:12px"></div>
          </div>
          <div class="bao-setting-section">
            <h3>預覽</h3>
            <textarea data-text-replace-source maxlength="5000" placeholder="貼一段 AI 回覆測試看看" style="width:100%;min-height:90px"></textarea>
            <button type="button" class="secondary" data-text-replace-preview style="margin-top:8px">預覽替換</button>
            <textarea data-text-replace-result readonly placeholder="替換結果" style="width:100%;min-height:90px;margin-top:8px"></textarea>
          </div>
        </div>
        <div class="bao-modal-footer">
          <button class="secondary" type="button" data-text-replace-clear>全部清除</button>
          <button class="primary" type="button" data-text-replace-save>儲存 MOD</button>
        </div>
      </section>`;
      document.body.appendChild(wrap);

      const list = wrap.querySelector('[data-text-replace-list]');
      const active = wrap.querySelector('#bao-text-replace-active');
      const scopeChat = wrap.querySelector('#bao-text-replace-scope-chat');
      const scopeStatus = wrap.querySelector('#bao-text-replace-scope-status');
      const source = wrap.querySelector('[data-text-replace-source]');
      const result = wrap.querySelector('[data-text-replace-result]');

      const renderRules = () => {
        list.replaceChildren();
        if (!draft.rules.length) {
          const note = document.createElement('div');
          note.className = 'note';
          note.textContent = '目前沒有替換規則。按「新增替換」開始。';
          list.append(note);
          return;
        }
        draft.rules.forEach((rule, index) => {
          const card = document.createElement('div');
          card.className = 'bao-memory-slot';
          card.dataset.textReplaceRule = rule.id;
          card.innerHTML = `
            <div class="bao-memory-slot-head">
              <label><input type="checkbox" data-rule-enabled ${rule.enabled ? 'checked' : ''}> 使用中</label>
              <div style="display:flex;gap:6px">
                <button class="text-button" type="button" data-rule-up title="往上">↑</button>
                <button class="text-button" type="button" data-rule-down title="往下">↓</button>
                <button class="text-button" type="button" data-rule-delete>刪除</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center">
              <input data-rule-find maxlength="${MAX_FIND}" value="${escape(rule.find)}" placeholder="尋找文字">
              <span aria-hidden="true">→</span>
              <input data-rule-replace maxlength="${MAX_REPLACE}" value="${escape(rule.replace)}" placeholder="替換成">
            </div>`;

          const sync = () => {
            rule.enabled = Boolean(card.querySelector('[data-rule-enabled]')?.checked);
            rule.find = card.querySelector('[data-rule-find]')?.value || '';
            rule.replace = card.querySelector('[data-rule-replace]')?.value || '';
          };
          card.querySelector('[data-rule-enabled]')?.addEventListener('change', sync);
          card.querySelector('[data-rule-find]')?.addEventListener('input', sync);
          card.querySelector('[data-rule-replace]')?.addEventListener('input', sync);
          card.querySelector('[data-rule-delete]')?.addEventListener('click', () => {
            draft.rules.splice(index, 1);
            renderRules();
          });
          card.querySelector('[data-rule-up]')?.addEventListener('click', () => {
            sync();
            if (index <= 0) return;
            [draft.rules[index - 1], draft.rules[index]] = [draft.rules[index], draft.rules[index - 1]];
            renderRules();
          });
          card.querySelector('[data-rule-down]')?.addEventListener('click', () => {
            sync();
            if (index >= draft.rules.length - 1) return;
            [draft.rules[index + 1], draft.rules[index]] = [draft.rules[index], draft.rules[index + 1]];
            renderRules();
          });
          list.append(card);
        });
      };

      const syncAll = () => {
        draft.active = Boolean(active.checked);
        draft.scope = {
          chat: Boolean(scopeChat?.checked),
          status: Boolean(scopeStatus?.checked)
        };
        list.querySelectorAll('[data-text-replace-rule]').forEach(card => {
          const rule = draft.rules.find(item => item.id === card.dataset.textReplaceRule);
          if (!rule) return;
          rule.enabled = Boolean(card.querySelector('[data-rule-enabled]')?.checked);
          rule.find = card.querySelector('[data-rule-find]')?.value || '';
          rule.replace = card.querySelector('[data-rule-replace]')?.value || '';
        });
      };

      wrap.querySelector('[data-text-replace-add]').addEventListener('click', () => {
        syncAll();
        if (draft.rules.length >= MAX_RULES) {
          alert(`最多 ${MAX_RULES} 條文字替換。`);
          return;
        }
        draft.active = true;
        active.checked = true;
        draft.rules.push({
          id: `text-replace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          find: '',
          replace: '',
          enabled: true
        });
        renderRules();
      });

      wrap.querySelector('[data-text-replace-preview]').addEventListener('click', () => {
        syncAll();
        result.value = apply(source.value, draft);
      });

      wrap.querySelector('[data-text-replace-clear]').addEventListener('click', () => {
        if (!draft.rules.length || confirm('確定清除這個故事的全部文字替換規則？')) {
          draft.rules = [];
          draft.active = false;
          active.checked = false;
          renderRules();
          result.value = '';
        }
      });

      wrap.querySelector('[data-text-replace-save]').addEventListener('click', () => {
        syncAll();
        const next = normalizeState(draft);
        if (next.rules.some(rule => rule.enabled && !rule.find)) {
          alert('啟用中的替換規則不能留空「尋找文字」。');
          return;
        }
        if (next.active && !next.scope.chat && !next.scope.status) {
          alert('請至少選擇一個套用範圍。');
          return;
        }
        write(next);
        close();
        updateButton();
      });

      wrap.querySelector('.bao-modal-close').addEventListener('click', close);
      wrap.addEventListener('click', event => { if (event.target === wrap) close(); });
      renderRules();
    }

    function injectButton() {
      const row = document.getElementById('bao-player-settings');
      if (!row) return;
      let button = row.querySelector('[data-bao-open="text-replace"]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.dataset.baoOpen = 'text-replace';
        button.addEventListener('click', open);
        row.appendChild(button);
      }
      updateButton();
    }

    const originalShell = App.renderChatShell.bind(App);
    App.renderChatShell = function(...args) {
      const value = originalShell(...args);
      setTimeout(injectButton, 0);
      return value;
    };

    root.addEventListener('bao:player-text-replace-changed', updateButton);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(injectButton, 200));
    } else {
      setTimeout(injectButton, 200);
    }
  }

  return {
    MAX_RULES, MAX_FIND, MAX_REPLACE, MAX_SOURCE,
    normalizeRule, normalizeState, apply,
    applyChat: (input, state) => apply(input, state, 'chat'),
    applyStatus: (input, state) => apply(input, state, 'status'),
    get: current, set: write, install
  };
});
