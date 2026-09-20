/* Verify that a story save reached durable browser storage before reporting success. */
(() => {
  'use strict';
  if (!window.App || !window.Storage || window.BAOStorageWriteGuard) return;
  const originalSave = App.saveStory;
  let generation = 0;
  const warningId = 'bao-storage-write-warning';

  const warn = message => {
    const composer = document.querySelector('#chat-view .composer');
    if (!composer) return;
    let warning = document.getElementById(warningId);
    if (!warning) {
      warning = document.createElement('div');
      warning.id = warningId;
      warning.setAttribute('role', 'alert');
      warning.style.cssText = 'margin:8px 0;padding:10px 13px;border:1px solid #b46f50;border-radius:10px;background:#36261f;color:#ffddc5;line-height:1.5';
      composer.before(warning);
    }
    warning.textContent = message;
  };
  const clearWarning = () => document.getElementById(warningId)?.remove();

  const verify = save => {
    const mode = Storage.status().mode;
    if (mode === 'indexedDB') return { ok: true, mode };
    if (mode !== 'localStorage') return { ok: false, mode };
    try {
      const raw = localStorage.getItem(Storage.prefix + Storage.storyKey);
      const stored = raw ? JSON.parse(raw) : null;
      return { ok: Boolean(stored && stored.savedAt === save.savedAt &&
        stored.chat?.messages?.length === save.chat?.messages?.length), mode };
    } catch { return { ok: false, mode }; }
  };

  App.saveStory = function(notify = false) {
    // The original method updates the in-memory cache synchronously. Its true
    // return value does NOT mean the IndexedDB transaction has committed.
    const accepted = originalSave.call(this, false);
    if (!accepted) {
      if (notify) alert('目前沒有可儲存的故事。');
      return false;
    }
    const save = Storage._cache?.autosave;
    const myGeneration = ++generation;
    Promise.resolve().then(() => Storage.flush()).then(() => {
      if (myGeneration !== generation && !notify) return;
      const result = verify(myGeneration === generation ? save : Storage._cache?.autosave || save);
      if (!result.ok) {
        const text = '故事尚未成功寫入瀏覽器儲存空間，請立即匯出完整故事備份，並檢查裝置剩餘空間。';
        if (myGeneration === generation) warn(text);
        if (notify) alert(text);
        return;
      }
      if (myGeneration === generation) clearWarning();
      if (notify) alert(result.mode === 'indexedDB'
        ? '故事已確認寫入這台裝置的 IndexedDB。建議定期匯出備份。'
        : '故事已寫入瀏覽器備援儲存空間（localStorage），容量有限，建議匯出備份。');
    }).catch(error => {
      if (myGeneration !== generation && !notify) return;
      console.warn('BAO/LAB story persistence verification failed:', error);
      const text = '無法確認故事已儲存，請立即匯出完整故事備份。';
      if (myGeneration === generation) warn(text);
      if (notify) alert(text);
    });
    return true;
  };
  window.BAOStorageWriteGuard = { verify };
})();