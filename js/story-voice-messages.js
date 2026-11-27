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

  async function commit(current, index, message, fields, blob, duration, sourceIsCurrent) {
    if (!current.storyId || !current.chapterId || !current.characterId || !message?.id)
      throw Error('故事需要有已儲存的開場或訊息，才能加入語音。');
    const source = Core.storyVoiceSource(message);
    const valid = () => sourceIsCurrent() && same(current)
      && Core.storyVoiceSource(Chat.messages[index]) === source;
    const delivery = {
      ...fields,
      id: crypto.randomUUID(),
      after: {id: message.id, index, revision: await Core.storyVoiceRevision(message)}
    };
    if (!valid() || !await library().flush(current.storyId))
      throw Error('目前的故事訊息已變更或尚未儲存。');
    const saved = await library().reconstruct(current.storyId, current.chapterId);
    if (!await Core.storyVoiceMatches(delivery, saved?.characterId, saved?.chat?.messages))
      throw Error('書庫中的故事訊息版本已變更。');
    const row = await Assets.save(current, blob, duration, valid, delivery);
    if (delivery.conversation === 'story') void refresh();
    return row;
  }

  function send(blob, duration, sourceIsCurrent, phoneTarget) {
    const current = scope();
    const index = Chat.messages.length - 1;
    const fields = {
      conversation: phoneTarget ? 'phone' : 'story',
      sender: 'player',
      recipient: current.characterId,
      ...(phoneTarget ? {thread: phoneScope(phoneTarget)} : {})
    };
    return commit(current, index, Chat.messages[index], fields, blob, duration,
      () => Chat.messages.length === index + 1 && sourceIsCurrent());
  }

  function saveNative(blob,duration,messageId,sourceIsCurrent,phoneTarget) {
    const current=scope(),index=Chat.messages.findIndex(message=>message.id===messageId&&message.role==="user");
    return commit(current,index,Chat.messages[index],{conversation:phoneTarget?"phone":"story",sender:"player",recipient:current.characterId,...(phoneTarget?{thread:phoneScope(phoneTarget)}:{})},blob,duration,sourceIsCurrent);
  }

  function saveGenerated({blob, duration, messageId, actor}, sourceIsCurrent) {
    const current = scope();
    const index = Chat.messages.findIndex(message => message.id === messageId && message.role === 'assistant');
    return commit(current, index, Chat.messages[index], {
      conversation: 'story', sender: 'character', recipient: 'player', characterId: current.characterId, actor
    }, blob, duration, sourceIsCurrent);
  }

  function clear(id) {
    const record = rows.get(id);
    if (!record) return;
    record.release();
    record.node.remove();
    rows.delete(id);
  }

  function playback(current, asset, isCurrent) {
    const node = element('details');
    node.className = 'yoru-story-voice-message';
    const player = element('audio');
    player.controls = true;
    player.preload = 'none';
    player.hidden = true;
    const label = asset.delivery.sender === 'character' ? asset.delivery.actor.name + ' 的角色配音' : '玩家語音訊息';
    player.setAttribute('aria-label', '播放' + label);
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
    node.append(element('summary', label + ' · ' + Math.ceil(asset.duration) + ' 秒'), player, download, status);
    node.addEventListener('toggle', async () => {
      if (!node.open) { release(); return; }
      const ticket = ++request;
      const matches = () => ticket === request && node.isConnected && node.open && isCurrent();
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
    return {node, release};
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
        if (asset.delivery?.conversation !== 'story' || !await Core.storyVoiceMatches(asset.delivery, current.characterId, Chat.messages)) continue;
        if (ticket !== revision || !same(current)) return;
        const anchor = stream.querySelector(':scope > .message[data-message-index="' + asset.delivery.after.index + '"]');
        if (!anchor) continue;
        present.add(asset.id);
        if (rows.get(asset.id)?.node.parentElement === anchor) continue;
        clear(asset.id);
        const record = playback(current, asset, () => same(current));
        anchor.append(record.node);
        rows.set(asset.id, {...record, scope: current});
      }
      if (ticket === revision) for (const id of rows.keys()) if (!present.has(id)) clear(id);
    } catch (_) {
      if (ticket === revision) for (const id of rows.keys()) clear(id);
    }
  }

  const phoneScope = target => ({
    id: target.threadId,
    members: target.group ? [...target.members].sort() : [target.senderId]
  });

  function mountPhone({form, thread, target, active: targetIsCurrent, recipientValid, draftClear, refreshPhone, closePhone}) {
    const current = scope();
    if (!current.storyId || !current.chapterId || !current.characterId) return null;
    const audience = JSON.stringify(phoneScope(target));
    const button = element('button', '語音訊息');
    button.type = 'button';
    button.className = 'bp-voice-message-button';
    form.insertAdjacentElement('afterend', button);
    const list = element('div');
    list.className = 'bp-voice-messages';
    thread.append(list);
    const records = new Map();
    let ticket = 0;
    let closed = false;
    const active = () => !closed && same(current) && form.isConnected && targetIsCurrent();
    async function paint() {
      const attempt = ++ticket;
      try {
        const assets = await Assets.list(current);
        const present = new Set();
        for (const asset of [...assets].reverse()) {
          if (asset.delivery?.conversation !== 'phone' || JSON.stringify(asset.delivery.thread) !== audience ||
              !await Core.storyVoiceMatches(asset.delivery, current.characterId, Chat.messages)) continue;
          if (attempt !== ticket || !active()) return;
          present.add(asset.id);
          if (records.has(asset.id)) continue;
          const record = playback(current, asset, active);
          list.append(record.node);
          records.set(asset.id, record);
        }
        if (attempt !== ticket || !active()) return;
        for (const [id, record] of records) {
          if (present.has(id)) continue;
          record.release();
          record.node.remove();
          records.delete(id);
        }
        const empty = thread.querySelector(':scope > .bp-empty');
        if (empty) empty.hidden = present.size > 0;
      } catch (_) {}
    }
    const release = () => { for (const {node} of records.values()) node.open = false; };
    const onVisibility = () => { if (document.hidden) release(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', release);
    button.addEventListener('click', () => {
      if (active() && !App.__requestPending) window.BAOStoryVoice?.open({phoneVoice: {target, active, refresh: paint, recipientValid, draftClear, refreshPhone, closePhone}});
    });
    void paint();
    function cleanup() {
      closed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', release);
      for (const record of records.values()) record.release();
      records.clear();
      button.remove();
      list.remove();
    }
    return {current: active, refresh: paint, cleanup};
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
  document.getElementById('chat-view')?.addEventListener('bao:phone-stage-visibility', event => {
    if (event.detail?.open) for (const {node} of rows.values()) node.open = false;
  });
  window.BAOStoryVoiceMessages = Object.freeze({send, saveNative, saveGenerated, refresh, mountPhone});
})();
