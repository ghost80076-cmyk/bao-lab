/* Local player voice messages attached to an exact story-history boundary. */
(() => {
  'use strict';
  const Assets = window.BAOStoryVoiceAssets;
  const Core = window.BAOStoryVoiceCore;
  if (!Assets || !Core || typeof App === 'undefined') return;

  const rows = new Map();
  let revision = 0;
  const active = () => document.getElementById('chat-view')?.classList.contains('active');
  const library = () => window.BAOStoryLibrary;
  const scope = () => ({
    ...library()?.refs(),
    characterId: App.activeCharacter?.id,
    owner: GameState.current
  });
  const same = current => {
    const next = scope();
    return active() && next.owner === current.owner && next.characterId === current.characterId
      && next.storyId === current.storyId && next.chapterId === current.chapterId;
  };
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };

  async function send(blob, duration, sourceIsCurrent) {
    const current = scope();
    const index = Chat.messages.length - 1;
    const message = Chat.messages[index];
    if (!current.storyId || !current.chapterId || !current.characterId || !message?.id)
      throw Error('故事需要有已儲存的開場或訊息，才能加入語音。');
    const source = Core.storyVoiceSource(message);
    const valid = () => sourceIsCurrent() && same(current) && Chat.messages.length === index + 1
      && Core.storyVoiceSource(Chat.messages[index]) === source;
    const delivery = {
      id: crypto.randomUUID(),
      conversation: 'story',
      sender: 'player',
      recipient: current.characterId,
      after: {id: message.id, index, revision: await Core.storyVoiceRevision(message)}
    };
    if (!valid() || !await library().flush(current.storyId))
      throw Error('目前的故事訊息已變更或尚未儲存。');
    const saved = await library().reconstruct(current.storyId, current.chapterId);
    if (!await Core.storyVoiceMatches(delivery, saved?.characterId, saved?.chat?.messages))
      throw Error('書庫中的故事訊息版本已變更。');
    const row = await Assets.save(current, blob, duration, valid, delivery);
    void refresh();
    return row;
  }

  function clear(id) {
    const record = rows.get(id);
    if (!record) return;
    record.release();
    record.node.remove();
    rows.delete(id);
  }

  function render(current, asset, anchor) {
    const node = element('details');
    node.className = 'yoru-story-voice-message';
    const player = element('audio');
    player.controls = true;
    player.preload = 'none';
    player.hidden = true;
    player.setAttribute('aria-label', '播放玩家語音訊息');
    const download = element('a', '下載語音');
    download.hidden = true;
    download.download = 'yorubay-voice.' + asset.extension;
    const status = element('p');
    status.setAttribute('aria-live', 'polite');
    let url = '', request = 0;
    const release = () => {
      request++;
      player.pause();
      player.removeAttribute('src');
      player.hidden = true;
      download.removeAttribute('href');
      download.hidden = true;
      if (url) URL.revokeObjectURL(url);
      url = '';
    };
    node.append(element('summary', '玩家語音訊息 · ' + Math.ceil(asset.duration) + ' 秒'), player, download, status);
    node.addEventListener('toggle', async () => {
      if (!node.open) { release(); return; }
      const ticket = ++request;
      const matches = () => ticket === request && node.isConnected && node.open && same(current);
      try {
        if (!await Core.storyVoiceMatches(asset.delivery, current.characterId, Chat.messages) || !matches()) return;
        const result = await Assets.get(current, asset.id);
        if (!matches() || !await Core.storyVoiceMatches(asset.delivery, current.characterId, Chat.messages) || !matches()) return;
        url = URL.createObjectURL(result.blob);
        player.src = url;
        player.hidden = false;
        download.href = url;
        download.hidden = false;
        status.textContent = '';
      } catch (error) {
        if (matches()) status.textContent = error.message || '無法讀取本機語音。';
      }
    });
    player.addEventListener('error', () => { if (url) status.textContent = '此瀏覽器無法播放這個音檔。'; });
    anchor.append(node);
    rows.set(asset.id, {node, release, scope: current});
  }

  async function refresh(stream = document.getElementById('chat-stream')) {
    const ticket = ++revision;
    const current = scope();
    for (const [id, row] of rows) if (!row.node.isConnected || !active() || !same(row.scope)) clear(id);
    if (!active() || !current.storyId || !current.chapterId || !stream) return;
    try {
      const assets = await Assets.list(current);
      const present = new Set();
      for (const asset of [...assets].reverse()) {
        if (!asset.delivery || !await Core.storyVoiceMatches(asset.delivery, current.characterId, Chat.messages)) continue;
        if (ticket !== revision || !same(current)) return;
        const anchor = stream.querySelector(':scope > .message[data-message-index="' + asset.delivery.after.index + '"]');
        if (!anchor) continue;
        present.add(asset.id);
        if (rows.get(asset.id)?.node.parentElement === anchor) continue;
        clear(asset.id);
        render(current, asset, anchor);
      }
      if (ticket === revision) for (const id of rows.keys()) if (!present.has(id)) clear(id);
    } catch (_) {
      if (ticket === revision) for (const id of rows.keys()) clear(id);
    }
  }

  App.wrapShowView('story-voice-messages:lifecycle', (next, view, ...args) => {
    const result = next(view, ...args);
    if (view === 'chat') void refresh();
    else { revision++; for (const id of rows.keys()) clear(id); }
    return result;
  });
  window.addEventListener('pagehide', () => { revision++; for (const id of rows.keys()) clear(id); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const {node} of rows.values()) node.open = false;
  });
  window.BAOStoryVoiceMessages = Object.freeze({send, refresh});
})();
