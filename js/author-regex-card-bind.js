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
    const raw = character?.import_metadata?.work_package_regex || character?.import_metadata?.preserved_source;
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
    const id = String(character?.id || '').trim();
    const manifestFile = String(
      app.characterManifest?.find?.(item => String(item?.id || '') === id)?.file || ''
    ).trim();
    const file = String(character?.catalog_file || manifestFile || '').trim();
    const official = character?.source === 'built-in' || /^data\/characters\//.test(manifestFile);
    if (!official) return '';
    if (!/^data\/characters\/[A-Za-z0-9_./-]+\.json$/.test(file) || file.endsWith('.regex.json')) return '';
    return file.replace(/\.json$/, '.regex.json');
  }

  // Upgrade only the untouched official Chicofy sidecar from the first release.
  // Browsers that already cached the old replacement would otherwise never
  // pick up the repaired CSS wheel or local images. Never overwrite imports,
  // manually edited rules, disabled settings or user permission preferences.
  const legacyChicofyReplacementLength = 9182;
  const legacyChicofyHash = 3265911382; // UTF-16 FNV-1a of archived official replacement.
  const ruleHash = value => {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
    return hash;
  };
  async function upgradeOfficialChicofy(character) {
    const id = String(character?.id || '');
    if (id !== 'jielai-rensheng') return false;
    const path = sidecarPath(character);
    const key = keyFor(id), oldValue = localStorage.getItem(key);
    if (!path || !oldValue || attemptedSidecars.has('upgrade:' + path)) return false;
    let saved;
    try { saved = JSON.parse(oldValue); } catch (_) { return false; }
    const rule = saved?.rules?.[0];
    if (saved.source !== 'official-sidecar' || saved.sourcePath !== path
      || saved.rules.length !== 1 || !rule
      || typeof rule.replacement !== 'string'
      || rule.replacement.length !== legacyChicofyReplacementLength
      || ruleHash(rule.replacement) !== legacyChicofyHash) return false;
    attemptedSidecars.add('upgrade:' + path);
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const raw = await response.json();
      if (raw.characterId !== id) throw new Error('characterId mismatch');
      const rules = Core.normalize(raw);
      if (rules.length !== 1 || rules[0].reason || !rules[0].replacement.includes('yb-static-rotor')) return false;
      // A player could edit consent/settings or navigate away while we fetch.
      if (app.activeCharacter?.id !== id || localStorage.getItem(key) !== oldValue) return false;
      localStorage.setItem(key, JSON.stringify({ ...saved, rules, sourceRevision: 2 }));
      notifyChanged();
      console.info('BAO/LAB: untouched Chicofy official opening upgraded; user consents preserved.');
      return true;
    } catch (error) {
      console.warn('BAO/LAB: unable to upgrade Chicofy original official opening; stored settings retained.', error?.message);
      return false;
    }
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
    if (localStorage.getItem(keyFor(character.id)) !== null) return upgradeOfficialChicofy(character);
    if (await bindOfficialSidecar(character)) return true;
    return bindImported(character);
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
    addon.src = 'js/yume-relationship-archive.js?v=2';
    addon.dataset.baoYumeArchive = '1';
    addon.onerror = () => console.warn('BAO/LAB 黑羽關係檔案載入失敗；原本故事不受影響。');
    document.head.appendChild(addon);
  }
})();
