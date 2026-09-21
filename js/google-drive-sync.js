/* Opt-in Drive sync: player owns appDataFolder; OAuth token only lives in memory. */
(() => {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const PREFIX = 'bao-lab-story-v1-';
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const CLIENT_ID = String(window.BAOGoogleDriveConfig?.clientId || '').trim();
  const Library = window.BAOStoryLibrary;
  const Backup = window.BAOStoryBackup;
  if (!Library || !Backup || !window.Storage) return;
  let token = '';
  let expiresAt = 0;
  let account = '';
  let busy = false;
  let timer = null;
  let tokenClient = null;
  let scriptPromise = null;
  let note = () => {};
  let refresh = () => {};
  const autoKey = 'bao-lab:gdrive:auto-v1';
  const stateKey = id => 'bao-lab:gdrive:sync-v1:' + id;
  const autoEnabled = () => localStorage.getItem(autoKey) === 'yes';
  const validId = value => /^story-[\w-]{8,100}$/.test(String(value || ''));
  const filename = id => PREFIX + id + '.json';
  const authorized = () => Boolean(token && Date.now() < expiresAt - 60000);
  const connected = () => Boolean(account && authorized());
  const state = () => {
    try { return JSON.parse(localStorage.getItem(stateKey(account)) || '{}'); }
    catch { return {}; }
  };
  const saveState = value => localStorage.setItem(stateKey(account), JSON.stringify(value));
  const errorText = error => error?.message || String(error || '未知錯誤');

  async function request(url, options = {}) {
    // about.get establishes the account identity; account is not known at this point.
    if (!authorized()) throw new Error('Google 授權已到期，請按「重新連結」後再同步。');
    const response = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) } });
    if (!response.ok) {
      if (response.status === 401) { token = ''; expiresAt = 0; account = ''; refresh(); }
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch {}
      throw new Error('Google Drive ' + response.status + (detail ? '：' + detail : '，請稍後再試。'));
    }
    return response;
  }
  const json = async (url, options) => (await request(url, options)).json();

  async function listRemote() {
    const files = [];
    let page = '';
    do {
      const query = new URLSearchParams({ spaces: 'appDataFolder', q: "name contains 'bao-lab-story-v1-' and trashed = false", pageSize: '1000', fields: 'nextPageToken,incompleteSearch,files(id,name,version,modifiedTime)' });
      if (page) query.set('pageToken', page);
      const data = await json(DRIVE + '/files?' + query);
      if (data.incompleteSearch) throw new Error('Google Drive 檔案清單不完整，本次停止同步。');
      files.push(...(data.files || []).filter(file => file.name.startsWith(PREFIX) && file.name.endsWith('.json')));
      page = data.nextPageToken || '';
    } while (page);
    return files;
  }
  const readRemote = async file => {
    const body = await (await request(DRIVE + '/files/' + encodeURIComponent(file.id) + '?alt=media')).json();
    const safe = Backup.sanitizeBundle(body);
    const id = safe.story?.storyId;
    if (!validId(id) || file.name !== filename(id)) throw new Error('雲端故事的識別碼與檔名不一致。');
    if (Number(safe.version || 1) > Backup.version) throw new Error('雲端故事格式較新，請先更新 BAO/LAB。');
    return safe;
  };
  async function makeRemote(id, bundle) {
    const boundary = 'bao_' + crypto.randomUUID().replace(/-/g, '');
    const body = new Blob([
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify({ name: filename(id), parents: ['appDataFolder'], mimeType: 'application/json' }),
      '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(bundle), '\r\n--' + boundary + '--'
    ]);
    return json(UPLOAD + '/files?uploadType=multipart&fields=id,name,version', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body
    });
  }
  async function updateRemote(file, bundle) {
    // Best-effort version check, NOT an atomic cross-device lock.
    const current = await json(DRIVE + '/files/' + encodeURIComponent(file.id) + '?fields=id,version,trashed');
    if (current.trashed || String(current.version) !== String(file.version)) throw new Error('雲端故事剛被其他裝置更新；請重新同步，避免覆蓋。');
    return json(UPLOAD + '/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=id,name,version', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bundle)
    });
  }
  const activeChat = id => Library.refs().storyId === id && document.getElementById('chat-view')?.classList.contains('active');

  async function restoreStableBundle(bundle) {
    const safe = Backup.sanitizeBundle(bundle);
    const id = String(safe.story?.storyId || '');
    if (!validId(id) || !await Library.open()) throw new Error('無法辨識雲端故事或本機故事庫不可用。');
    if (activeChat(id)) throw new Error('這個故事正在遊玩，請先離開故事並重新整理，再下載雲端進度。');
    const previous = Library.refs();
    const previousRecords = await Library.allRecords();
    const existing = previousRecords.some(record => record.kind === 'story' && record.storyId === id);
    const chapterIds = new Set(safe.chapters.map(chapter => chapter.chapterId));
    if ([...chapterIds].some(chapterId => !/^(chapter|branch)-[\w-]{8,100}$/.test(chapterId))) throw new Error('雲端故事章節識別碼不合法。');
    try {
      for (const chapter of safe.chapters) {
        const payload = Storage.sanitizeImportedStory(chapter.payload);
        payload.savedAt = chapter.updatedAt;
        payload._library = {
          storyId: id, chapterId: chapter.chapterId, storyCreatedAt: safe.story.createdAt,
          chapterCreatedAt: chapter.createdAt, chapterLabel: chapter.label,
          parentChapterId: chapter.parentChapterId || '', branchPointMessageId: chapter.branchPointMessageId || '',
          branchPointSeq: chapter.branchPointSeq, branchPointPreview: chapter.branchPointPreview || ''
        };
        Library.adoptRefs(payload);
        if (!await Library.persist(payload)) throw new Error('章節寫入本機故事庫失敗。');
        const messageIds = new Set((payload.chat?.messages || []).map(message => String(message.id || '')));
        const checkpoints = (chapter.checkpoints || []).filter(checkpoint => messageIds.has(checkpoint.messageId)).map(checkpoint => {
          const clean = Storage.scrubSecrets(Storage.clone(checkpoint.payload));
          clean.config = clean.config || {};
          clean.config.api = { ...(clean.config.api || {}), key: '' };
          clean.state = clean.state || {};
          clean.state.config = clean.config;
          clean.chat = clean.chat || {};
          delete clean.chat.messages;
          clean._library = Storage.clone(payload._library);
          return {
            id: 'checkpoint:' + id + ':' + chapter.chapterId + ':' + checkpoint.messageId,
            kind: 'checkpoint', storyId: id, chapterId: chapter.chapterId, messageId: checkpoint.messageId,
            seq: checkpoint.seq, updatedAt: checkpoint.updatedAt, payload: clean
          };
        });
        if (checkpoints.length) await Library.transaction('readwrite', store => checkpoints.forEach(record => store.put(record)));
      }
      const records = await Library.allRecords();
      const story = records.find(record => record.kind === 'story' && record.storyId === id);
      const selected = chapterIds.has(safe.activeChapterId) ? safe.activeChapterId : safe.chapters[0].chapterId;
      story.title = String(safe.story.title || story.title || '雲端故事').slice(0, 100);
      story.createdAt = safe.story.createdAt;
      story.updatedAt = safe.story.updatedAt;
      story.activeChapterId = selected;
      const stale = existing ? records.filter(record => record.storyId === id && record.chapterId && !chapterIds.has(record.chapterId)) : [];
      await Library.transaction('readwrite', store => { store.put(story); stale.forEach(record => store.delete(record.id)); });
      const autosave = Storage.loadStory();
      if (!autosave || autosave._library?.storyId === id) {
        const restored = await Library.reconstruct(id, selected);
        if (restored) {
          Storage._commitOperation({ type: 'saveStory', payload: restored });
          await Storage.flush();
        }
      }
      window.BAORefreshSaveUI?.();
    } finally {
      if (previous.storyId && previous.chapterId) Library.adoptRefs({ _library: previous });
      else Library.clearRefs();
    }
  }

  function ensureGIS() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('無法載入 Google 登入服務。'));
      document.head.append(script);
    }).catch(error => { scriptPromise = null; throw error; });
    return scriptPromise;
  }
  async function connect() {
    if (!CLIENT_ID) throw new Error('站長尚未設定 Google OAuth Client ID；Google 登入目前未開放。');
    if (!window.google?.accounts?.oauth2) await ensureGIS();
    if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
    const granted = new Promise((resolve, reject) => {
      tokenClient.callback = response => response?.access_token ? resolve(response) : reject(new Error(response?.error || 'Google 授權沒有完成。'));
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
    const result = await granted;
    token = result.access_token;
    expiresAt = Date.now() + Number(result.expires_in || 3500) * 1000;
    // Authorization exists here, but account identity is intentionally unknown until about.get.
    const info = await json(DRIVE + '/about?fields=user(permissionId)');
    if (!info.user?.permissionId) { token = ''; expiresAt = 0; account = ''; throw new Error('Google 沒有提供帳號識別碼，已停止同步以避免混用帳號。'); }
    account = String(info.user.permissionId);
    note('已連結 Google Drive。故事只會存入你帳號的 BAO/LAB 專用資料夾。');
    refresh();
    return account;
  }
  function disconnect() {
    token = ''; expiresAt = 0; account = '';
    if (timer) clearTimeout(timer);
    note('已在這個頁面中中斷連結；本機故事不受影響。'); refresh();
  }

  async function sync() {
    if (busy) return { busy: true };
    if (!connected()) throw new Error('請先連結 Google Drive，授權到期時請重新連結。');
    busy = true;
    refresh();
    const result = { uploaded: 0, downloaded: 0, skipped: 0, conflicts: 0, errors: [] };
    try {
      if (activeChat(Library.refs().storyId) && window.App?.activeCharacter && window.GameState?.current) Storage.saveStory();
      if (!await Library.flush()) throw new Error('本機故事庫無法使用，已停止同步。');
      const local = await Library.listStories();
      const remoteFiles = await listRemote();
      const groups = new Map();
      remoteFiles.forEach(file => {
        const id = file.name.slice(PREFIX.length, -5);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(file);
      });
      const localMap = new Map(local.map(story => [story.storyId, story]));
      const syncMap = state();
      for (const id of new Set([...localMap.keys(), ...groups.keys()])) {
        if (!validId(id)) continue;
        const files = groups.get(id) || [];
        if (files.length > 1) {
          result.conflicts++;
          result.errors.push('「' + (localMap.get(id)?.title || id) + '」有重複的雲端檔案，請先人工確認。');
          continue;
        }
        const remote = files[0];
        const story = localMap.get(id);
        const baseline = syncMap[id];
        if (!remote && story) {
          try {
            const bundle = await Backup.buildBundle(id);
            const uploaded = await makeRemote(id, bundle);
            syncMap[id] = { fileId: uploaded.id, version: String(uploaded.version), updatedAt: bundle.story.updatedAt };
            result.uploaded++;
          } catch (error) { result.errors.push((story.title || id) + '：' + errorText(error)); }
          continue;
        }
        if (remote && !story) {
          try {
            await restoreStableBundle(await readRemote(remote));
            const imported = (await Library.listStories()).find(item => item.storyId === id);
            syncMap[id] = { fileId: remote.id, version: String(remote.version), updatedAt: imported?.updatedAt || '' };
            result.downloaded++;
          } catch (error) { result.errors.push(id + '：' + errorText(error)); }
          continue;
        }
        if (!remote || !story) continue;
        const known = baseline?.fileId === remote.id;
        const changedLocal = !known || baseline.updatedAt !== story.updatedAt;
        const changedRemote = !known || String(baseline.version) !== String(remote.version);
        if (changedLocal && changedRemote) {
          result.conflicts++;
          result.errors.push('「' + (story.title || id) + '」兩端版本尚未確認一致，已保留雙方資料，不會覆蓋。');
          continue;
        }
        if (changedRemote) {
          if (activeChat(id)) { result.conflicts++; result.errors.push('「' + story.title + '」正在遊玩；先離開故事並重新整理，再同步更新。'); continue; }
          try {
            await restoreStableBundle(await readRemote(remote));
            syncMap[id] = { fileId: remote.id, version: String(remote.version), updatedAt: (await Library.listStories()).find(item => item.storyId === id)?.updatedAt || '' };
            result.downloaded++;
          } catch (error) { result.errors.push(story.title + '：' + errorText(error)); }
          continue;
        }
        if (changedLocal) {
          try {
            const bundle = await Backup.buildBundle(id);
            const uploaded = await updateRemote(remote, bundle);
            syncMap[id] = { fileId: remote.id, version: String(uploaded.version), updatedAt: bundle.story.updatedAt };
            result.uploaded++;
          } catch (error) { result.errors.push(story.title + '：' + errorText(error)); }
        } else result.skipped++;
      }
      saveState(syncMap);
      if (result.downloaded) window.BAORefreshSaveUI?.();
      note(`同步結果：上傳 ${result.uploaded}、下載 ${result.downloaded}、無變動 ${result.skipped}、待確認 ${result.conflicts}。` + (result.errors.length ? '\n' + result.errors.join('\n') : ''));
      return result;
    } finally { busy = false; refresh(); }
  }

  function schedule() {
    if (!autoEnabled() || !connected() || busy) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync().catch(error => note('自動同步未完成：' + errorText(error))); }, 60000);
  }
  async function installSaveHook() {
    await Library.open();
    Library.install();
    if (Storage.saveStory._baoDriveHook) return;
    const original = Storage.saveStory.bind(Storage);
    const wrapped = (...args) => { const success = original(...args); if (success) schedule(); return success; };
    wrapped._baoDriveHook = true;
    Storage.saveStory = wrapped;
  }
  function installUI() {
    const nav = document.querySelector('.topbar nav');
    if (!nav || document.getElementById('bao-drive-button')) return;
    const button = document.createElement('button');
    button.id = 'bao-drive-button'; button.type = 'button'; button.textContent = '雲端故事';
    nav.append(button);
    const panel = document.createElement('dialog');
    panel.id = 'bao-drive-panel';
    panel.style.cssText = 'max-width:min(92vw,520px);width:100%;max-height:85vh;overflow:auto;border-radius:16px;padding:20px;background:#1b1d28;color:#fff;border:1px solid #555;box-shadow:0 14px 60px #0009';
    const title = document.createElement('h2'); title.textContent = 'Google Drive 故事同步';
    const description = document.createElement('p');
    description.textContent = '故事優先保存在本機，經你授權才會上傳到自己的 Google 雲端硬碟。API Key 不同步。首次換裝置請先按「立即同步」下載。';
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.style.whiteSpace = 'pre-wrap';
    const connectButton = document.createElement('button'); connectButton.type = 'button'; connectButton.className = 'primary';
    const syncButton = document.createElement('button'); syncButton.type = 'button'; syncButton.className = 'secondary'; syncButton.textContent = '立即同步';
    const disconnectButton = document.createElement('button'); disconnectButton.type = 'button'; disconnectButton.className = 'secondary'; disconnectButton.textContent = '中斷連結';
    const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'secondary'; closeButton.textContent = '關閉';
    const autoLabel = document.createElement('label'); autoLabel.style.cssText = 'display:block;margin:12px 0';
    const auto = document.createElement('input'); auto.type = 'checkbox'; auto.checked = autoEnabled();
    autoLabel.append(auto, document.createTextNode(' 啟用自動同步（儲存後約一分鐘合併上傳；授權到期會暫停）'));
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    actions.append(connectButton, syncButton, disconnectButton, closeButton);
    panel.append(title, description, autoLabel, actions, status);
    document.body.append(panel);
    note = message => { status.textContent = message; };
    refresh = () => {
      connectButton.textContent = connected() ? '重新連結' : '連結 Google';
      connectButton.disabled = busy || !CLIENT_ID;
      syncButton.disabled = busy || !connected();
      disconnectButton.disabled = busy || !token;
      syncButton.textContent = busy ? '同步中…' : '立即同步';
    };
    button.onclick = () => {
      refresh();
      if (panel.showModal) panel.showModal(); else panel.setAttribute('open', '');
      if (CLIENT_ID && !window.google?.accounts?.oauth2) ensureGIS().catch(error => note(errorText(error)));
    };
    closeButton.onclick = () => panel.close ? panel.close() : panel.removeAttribute('open');
    connectButton.onclick = async () => { try { await connect(); } catch (error) { note(errorText(error)); refresh(); } };
    syncButton.onclick = () => sync().catch(error => note(errorText(error)));
    disconnectButton.onclick = disconnect;
    auto.onchange = () => {
      localStorage.setItem(autoKey, auto.checked ? 'yes' : 'no');
      if (auto.checked) schedule(); else clearTimeout(timer);
    };
    note(CLIENT_ID ? '尚未連結 Google。第一次同步前建議先匯出一份故事備份。' : '站長尚未完成 Google OAuth 設定，因此連結與同步按鈕暫時停用。本機故事仍可照常遊玩。');
    refresh();
  }
  window.BAOGoogleDriveSync = { connect, disconnect, sync, listRemote, restoreStableBundle, connected, filename };
  installUI();
  installSaveHook().catch(error => console.warn('BAO/LAB Google Drive save hook unavailable:', error));
})();