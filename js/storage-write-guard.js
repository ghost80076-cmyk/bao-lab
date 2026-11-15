/* Verify that a story save reached durable browser storage before reporting success. */
(() => {
  'use strict';
  if (window.BAOStorageWriteGuard || typeof App === 'undefined' || typeof Storage === 'undefined') return;
  const originalSave = App.saveStory;
  let generation = 0;
  let pending = false;
  let unsafe = false;
  let settlement = Promise.resolve(true);
  const warningId = 'bao-storage-write-warning';

  const warn = (message, saving = false) => {
    const composer = document.querySelector('#chat-view .composer');
    if (!composer) return;
    let warning = document.getElementById(warningId);
    if (!warning) {
      warning = document.createElement('div');
      warning.id = warningId;
      warning.style.cssText = 'margin:8px 0;padding:10px 13px;border:1px solid #b46f50;border-radius:10px;background:#36261f;color:#ffddc5;line-height:1.5;overflow-wrap:anywhere';
      composer.before(warning);
    }
    warning.setAttribute('role', saving ? 'status' : 'alert');
    warning.setAttribute('aria-busy', String(saving));
    warning.textContent = message;
    if (!saving) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'secondary';
      retry.textContent = '重試儲存';
      retry.dataset.retryStorySave = 'true';
      retry.style.cssText = 'display:block;margin-top:8px;min-width:44px;min-height:44px';
      retry.addEventListener('click', () => {
        retry.disabled = true;
        void retrySave();
      });
      warning.append(retry);
    }
  };
  const clearWarning = () => document.getElementById(warningId)?.remove();
  const tell = (message, tone = 'info') => {
    if (window.BAOFeedback?.notify) return window.BAOFeedback.notify(message, tone);
    warn(message);
    return true;
  };

  const verify = save => {
    const mode = Storage.status().mode;
    if (mode === 'indexedDB') return { ok: true, mode };
    if (mode !== 'localStorage') return { ok: false, mode };
    try {
      const snapshot = Storage._readFallbackSnapshot?.();
      const raw = snapshot ? null : localStorage.getItem(Storage.prefix + Storage.storyKey);
      const stored = snapshot ? snapshot.autosave : raw ? JSON.parse(raw) : null;
      // Compare normalized payloads, not only timestamp and message count: two
      // edits in one clock tick can have the same timestamp and length.
      const normalize = value => Storage.sanitizeImportedStory ? Storage.sanitizeImportedStory(value) : value;
      return { ok: Boolean(stored && save && JSON.stringify(normalize(stored)) === JSON.stringify(normalize(save))), mode };
    } catch { return { ok: false, mode }; }
  };

  App.saveStory = function(notify = false) {
    const owner = window.GameState?.current, config = this.config;
    // A player message awaiting its reply is transient. Preserve the last
    // complete save and capture this story only after its existing turn settles.
    const transient = this.__requestPending && window.Chat?.messages?.at(-1)?.role === 'user';
    const turn = transient ? (this.__sendMessageTasks?.size
      ? Promise.allSettled([...this.__sendMessageTasks]) : this.__requestSettlement) : null;
    if (transient && !turn) {
      if (notify) tell('故事仍在生成，請完成或取消後再儲存。', 'info');
      return false;
    }
    // The original method updates the in-memory cache synchronously. Its true
    // return value does NOT mean the IndexedDB transaction has committed.
    const accepted = turn ? true : originalSave.call(this, false);
    if (!accepted) {
      if (notify) tell('目前沒有可儲存的故事。', 'error');
      return false;
    }
    let save = Storage._cache?.autosave;
    const myGeneration = ++generation;
    pending = unsafe = true;
    if (notify || this.__exitHandoff) warn('正在儲存故事，請稍候…', true);
    settlement = Promise.resolve(turn).catch(() => {}).then(async () => {
      if (turn) {
        if (myGeneration !== generation || window.GameState?.current !== owner || this.config !== config) return false;
        if (!originalSave.call(this, false)) throw new Error('故事尚未受理儲存。');
        save = Storage._cache?.autosave;
      }
      await Storage.flush();
      const library = window.BAOStoryLibrary;
      const storyId = save?._library?.storyId;
      const libraryOK = !library || Boolean(storyId && await library.flush(storyId));
      // A newer save owns the status. Never report success for another story
      // or for a snapshot superseded while this write was being verified.
      if (myGeneration !== generation || window.GameState?.current !== owner) return false;
      const result = verify(save);
      if (!result.ok || !libraryOK) {
        const text = (!result.ok ? '目前內容尚未成功寫入瀏覽器儲存空間。' : '目前內容已寫入自動存檔，但故事庫章節尚未成功儲存。')
          + '內容仍保留在本頁，請先不要關閉或重新整理；可重試儲存，並檢查裝置剩餘空間。';
        warn(text);
        if (notify) tell(text, 'error');
        return false;
      }
      unsafe = false;
      clearWarning();
      if (notify) tell(result.mode === 'indexedDB'
        ? '故事已確認寫入這台裝置的 IndexedDB。建議定期匯出備份。'
        : '故事已寫入瀏覽器備援儲存空間（localStorage），容量有限，建議匯出備份。', 'success');
      return true;
    }).catch(error => {
      if (myGeneration !== generation || window.GameState?.current !== owner) return false;
      console.warn('BAO/LAB story persistence verification failed:', error);
      const text = '無法確認目前內容已完成儲存。內容仍保留在本頁，請先不要關閉或重新整理，並重試儲存。';
      warn(text);
      if (notify) tell(text, 'error');
      return false;
    }).finally(() => {
      if (myGeneration === generation) pending = false;
    });
    return true;
  };
  const whenIdle = async () => {
    let task, ok;
    do { task = settlement; ok = await task; } while (task !== settlement);
    return ok;
  };
  const retrySave = () => {
    const owner = window.GameState?.current, storyId = window.BAOStoryLibrary?.refs?.().storyId;
    const myGeneration = ++generation;
    pending = unsafe = true;
    // Track the whole retry immediately, including the chapter replay before
    // App.saveStory runs, so whenIdle never observes the preceding failure.
    settlement = Promise.resolve().then(() => window.BAOStoryLibrary?.retryFailedWrites?.(storyId)).catch(error => {
      console.warn('BAO/LAB chapter retry failed:', error);
    }).then(() => {
      if (myGeneration !== generation || window.GameState?.current !== owner) return false;
      if (!App.saveStory(true)) return false;
      return whenIdle();
    }).finally(() => {
      if (myGeneration === generation) pending = false;
    });
    return settlement;
  };
  window.addEventListener?.('beforeunload', event => {
    if (!pending && !unsafe && !App.__requestPending && !App.__sendMessageTasks?.size && !window.Chat?.summarizing) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.BAOStorageWriteGuard = { verify, whenIdle, retry: retrySave };
})();
