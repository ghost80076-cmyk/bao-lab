/* Keep Character Studio and the playable character library in sync without discarding old cards. */
(() => {
  'use strict';
  // Homepage declares CharacterEngine as a top-level const, not a window property.
  const engine = typeof CharacterEngine !== 'undefined' ? CharacterEngine : window.CharacterEngine;
  if (!engine) return;

  const LEGACY_KEY = engine.storageKey || 'bao-lab:custom-characters';
  const PENDING_KEY = 'bao-lab:character-pending-upserts-v1';
  const inStudio = Boolean(document.getElementById('studio-form'));

  function readArray(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`角色備份格式異常：${key}`);
    return parsed;
  }

  function validCard(card) {
    return card && typeof card === 'object' && !Array.isArray(card)
      && typeof card.id === 'string' && card.id.trim()
      && typeof card.name === 'string' && card.name.trim();
  }

  // Journal the original editor's synchronous install call before an IDB write
  // begins. If the tab closes early, the next visit can replay the saved card.
  if (inStudio && !engine.__baoStudioSaveJournal) {
    const originalSave = engine.saveCustom.bind(engine);
    engine.saveCustom = function saveStudioCard(character) {
      const card = engine.normalize(character);
      const pending = readArray(PENDING_KEY).filter(item => item?.id !== card.id);
      pending.push(card);
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      return originalSave(character);
    };
    engine.__baoStudioSaveJournal = true;
  }

  function refreshCharacters() {
    const app = window.App;
    if (!app || !Array.isArray(app.characters)) return;
    const builtIn = app.characters.filter(card => card.source !== 'local-import');
    const seen = new Set();
    app.characters = [...engine.loadCustom(), ...builtIn].filter(card =>
      card?.id && !seen.has(card.id) && seen.add(card.id));
    const category = document.querySelector('.category-portal.active')?.dataset.category || 'all';
    app.renderCharacters?.(category);
  }

  async function ready() {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (typeof engine.readyCustomLibrary === 'function'
          && typeof engine.saveCustomAsync === 'function'
          && typeof engine.loadCustomAsync === 'function') return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('角色資料庫尚未載入，舊資料保持原狀。');
  }

  async function reconcile() {
    // Capture before ready(): initial migration may remove the legacy key.
    const legacy = readArray(LEGACY_KEY);
    const pending = readArray(PENDING_KEY);
    await ready();
    await engine.readyCustomLibrary();
    const known = new Set((await engine.loadCustomAsync()).map(card => card.id));
    let restored = 0;
    // Existing IndexedDB cards take precedence; never overwrite conflicting old IDs.
    for (const raw of legacy) {
      if (!validCard(raw) || known.has(raw.id)) continue;
      await engine.saveCustomAsync(raw);
      known.add(raw.id);
      restored++;
    }
    // Journaled edits are intentional updates, including moving male -> R18.
    for (const raw of pending) {
      if (!validCard(raw)) continue;
      await engine.saveCustomAsync(raw);
      known.add(raw.id);
      restored++;
    }
    if (pending.length) {
      // Clear only the snapshot handled above. A new save could have arrived
      // while asynchronous replay was running; never delete that new entry.
      const latest = readArray(PENDING_KEY);
      const handled = new Map(pending.filter(validCard).map(card => [card.id, JSON.stringify(card)]));
      const remaining = latest.filter(card => handled.get(card?.id) !== JSON.stringify(card));
      if (remaining.length) localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
      else localStorage.removeItem(PENDING_KEY);
    }
    if (restored) refreshCharacters();
    return restored;
  }

  engine.reconcileCustomCharacters = reconcile;
  void reconcile().catch(error => {
    console.warn('BAO/LAB character recovery could not complete:', error);
    if (inStudio) {
      const status = document.getElementById('studio-status');
      if (status) status.textContent = '角色庫同步未完成，請先匯出 JSON 備份。';
    }
  });
})();
