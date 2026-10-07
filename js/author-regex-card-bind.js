/* Bind card-owned author regex to local display settings without changing story data. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  const app = window.App || (typeof App !== 'undefined' ? App : null);
  const chat = window.Chat || (typeof Chat !== 'undefined' ? Chat : null);
  const state = window.GameState || (typeof GameState !== 'undefined' ? GameState : null);
  const storyStorage = window.Storage || (typeof Storage !== 'undefined' ? Storage : null);
  if (!Core || !app || !chat || !state || !storyStorage) return;

  window.App = app;
  window.Chat = chat;
  window.GameState = state;
  window.Storage = storyStorage;

  const PREFIX = 'bao-lab:author-regex:v1:';
  const attemptedSidecars = new Set();

  const keyFor = id => PREFIX + encodeURIComponent(String(id || '').slice(0, 80));

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent('bao:author-regex-changed'));
    window.BAORegexChat?.schedule?.();
    window.BAOAuthorInline?.refresh?.();
    window.BAOAuthorDock?.refresh?.();
  }

  function saveIfUnset(id, payload) {
    const key = keyFor(id);
    if (!id || localStorage.getItem(key) !== null) return false;
    localStorage.setItem(key, JSON.stringify(payload));
    notifyChanged();
    return true;
  }

  function bindImported(character) {
    const id = String(character?.id || '').slice(0, 80);
    const raw = character?.import_metadata?.preserved_source;
    if (!id || !raw) return false;
    try {
      const rules = Core.normalize(raw);
      if (!rules.length) return false;
      const saved = saveIfUnset(id, { enabled: false, allowScripts: false, rules });
      if (saved) console.info('BAO/LAB: original imported-card regex linked, disabled until player opts in.');
      return saved;
    } catch (error) {
      console.warn('BAO/LAB: unable to link imported-card regex; story data was not changed.', error?.message);
      return false;
    }
  }

  function sidecarPath(character) {
    if (character?.source !== 'built-in') return '';
    const file = String(character?.catalog_file || '').trim();
    if (!/^data\/characters\/[A-Za-z0-9_./-]+\.json$/.test(file) || file.endsWith('.regex.json')) return '';
    return file.replace(/\.json$/, '.regex.json');
  }

  async function bindOfficialSidecar(character) {
    const id = String(character?.id || '').slice(0, 80);
    const path = sidecarPath(character);
    if (!id || !path || localStorage.getItem(keyFor(id)) !== null || attemptedSidecars.has(path)) return false;
    attemptedSidecars.add(path);
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const raw = await response.json();
      if (String(raw?.characterId || raw?.character_id || id) !== id) {
        throw new Error('characterId mismatch');
      }
      const rules = Core.normalize(raw);
      if (!rules.length) return false;
      const saved = saveIfUnset(id, {
        enabled: true,
        allowScripts: false,
        allowExternalAssets: false,
        allowStateSharing: false,
        rules,
        source: 'official-sidecar',
        sourcePath: path
      });
      if (saved) console.info('BAO/LAB: official author regex sidecar enabled for', id);
      return saved;
    } catch (error) {
      console.warn('BAO/LAB: official author regex sidecar could not be linked; raw story text remains visible.', error?.message);
      return false;
    }
  }

  async function sync() {
    const character = app.activeCharacter;
    if (!character?.id) return false;
    if (localStorage.getItem(keyFor(character.id)) !== null) return false;
    if (bindImported(character)) return true;
    return bindOfficialSidecar(character);
  }

  const renderShell = app.renderChatShell.bind(app);
  app.renderChatShell = function(...args) {
    const value = renderShell(...args);
    void sync();
    return value;
  };

  window.BAOAuthorCardBind = { sync, sidecarPath };
  void sync();

  if (!document.querySelector('script[data-bao-yume-archive]')) {
    const addon = document.createElement('script');
    addon.src = 'js/yume-relationship-archive.js';
    addon.dataset.baoYumeArchive = '1';
    addon.onerror = () => console.warn('BAO/LAB 黑羽關係檔案載入失敗；原本故事不受影響。');
    document.head.appendChild(addon);
  }
})();
