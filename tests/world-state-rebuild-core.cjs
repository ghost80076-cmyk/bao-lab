const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
global.window = global;
global.document = { querySelector: () => null };
global.App = { renderChatShell() {}, config: { api: { key: 'mock', model: 'main' }, cost: { stateApiMode: 'same' } }, activeCharacter: { name: '小夏' }, saveStory: () => true };
global.Chat = { messages: [{ role: 'user', content: '離開公寓去醫院' }, { role: 'assistant', content: '三點，你們已抵達醫院。' }], summary: '先前住在公寓。' };
global.GameState = { current: null, applyUpdate(data) { Object.assign(this.current, { time: data.time, location: data.location }); for (const n of data.npcs || []) Object.assign(this.current.npcs.find(x => x.name === n.name) || {}, n); Object.assign(this.current.characterStatuses, data.character_statuses); Object.assign(this.current.modules, data.modules); } };
global.BAOCharacterStatus = { configFor: () => ({ fields: [{ key: 'activity', track: true }] }) };
global.WorldStateEngine = { enabled: () => true, update: async () => ({}), parse: JSON.parse };
vm.runInThisContext(fs.readFileSync('js/helper-data.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('js/world-state-cost.js', 'utf8'));
const initial = () => ({ time: '02:16', location: '公寓', npcs: [{ npc_id: 'npc-1', name: '小夏', location: '公寓', presence: 'present', portrait: 'keep.png' }], characterStatuses: { 小夏: { activity: '等在公寓', manual: 'keep' } }, pendingStateTurns: [{ player: '舊', assistant: '舊' }], events: ['保留歷史'], modules: { inventory: ['keep'] } });
const reply = () => ({ text: JSON.stringify({ time: '03:00', location: '醫院', npcs: [{ npc_id: 'npc-1', name: '小夏', location: '醫院', presence: 'present' }], character_statuses: { 小夏: { activity: '掛號' } } }) });
let prompt;
global.API = { send: async (config, messages) => { prompt = messages[1].content; assert.equal(config.__stateTask, true); return reply(); } };
(async () => {
  GameState.current = initial();
  const history = JSON.stringify(Chat.messages);
  await WorldStateEngine.rebuild(App.config);
  assert.equal(GameState.current.location, '醫院');
  assert.equal(GameState.current.npcs[0].portrait, 'keep.png');
  assert.equal(GameState.current.npcs[0].npc_id, 'npc-1');
  assert.equal(GameState.current.characterStatuses.小夏.activity, '掛號');
  assert.deepEqual(GameState.current.events, ['保留歷史']);
  assert.deepEqual(GameState.current.modules.inventory, ['keep']);
  assert.equal(GameState.current.pendingStateTurns.length, 1);
  assert.equal(GameState.current.stateRebuildBackup.location, '公寓');
  assert.equal(JSON.stringify(Chat.messages), history);
  assert(!prompt.includes('02:16'), 'stale snapshot must not enter evidence');
  assert(!prompt.includes('先前住在公寓'), 'recent mode excludes old summary');
  await WorldStateEngine.rebuild(App.config, 'deep');
  assert(prompt.includes('先前住在公寓'), 'deep mode includes summary');
  GameState.current = initial();
  delete GameState.current.pendingStateTurns;
  API.send = async () => reply();
  await WorldStateEngine.rebuild(App.config);
  assert.equal(GameState.current.location, '醫院');
  assert.deepEqual(GameState.current.stateRebuildBackup.pendingStateTurns, []);
  GameState.current = initial();
  API.send = async () => ({ text: '{}' });
  await assert.rejects(WorldStateEngine.rebuild(App.config), /完整/);
  assert.equal(GameState.current.location, '公寓');
  assert.equal(GameState.current.pendingStateTurns.length, 1);
  let release;
  API.send = () => new Promise(r => { release = r; });
  const running = WorldStateEngine.rebuild(App.config);
  await assert.rejects(WorldStateEngine.rebuild(App.config), /正在整理/);
  Chat.messages.push({ role: 'user', content: '新回合' });
  release(reply());
  await assert.rejects(running, /已變更/);
  assert.equal(GameState.current.location, '公寓');
  const switched = WorldStateEngine.rebuild(App.config);
  const other = initial(); other.location = '另一個故事'; GameState.current = other;
  release(reply());
  await assert.rejects(switched, /已切換/);
  assert.equal(other.location, '另一個故事');
  GameState.current = initial();
  API.send = async () => { throw new Error('offline'); };
  await assert.rejects(WorldStateEngine.rebuild(App.config), /offline/);
  assert.equal(GameState.current.location, '公寓');
  API.send = async () => ({ ...reply(), finishReason: 'MAX_TOKENS' });
  await assert.rejects(WorldStateEngine.rebuild(App.config), /不完整/);
  const apply = GameState.applyUpdate;
  GameState.applyUpdate = () => { GameState.current.location = 'partial'; throw new Error('apply error'); };
  API.send = async () => reply();
  await assert.rejects(WorldStateEngine.rebuild(App.config), /apply error/);
  assert.equal(GameState.current.location, '公寓');
  GameState.applyUpdate = apply;
  // Work on live, unsaved evidence and repair every allowed module, without
  // overwriting author/player data that has no newer evidence.
  Chat.messages = [{ role: 'user', content: '離開展會' }, { role: 'assistant', content: '到車旁，契約剩三天，他換上外套。' }];
  const moduleState = () => ({ ...initial(), moduleDefinitions: [
    { id: 'lover', label: '假戀人', kind: 'object', tracking: 'high', fields: [{ key: 'mood', type: 'text' }] },
    { id: 'contract', label: '契約', kind: 'object', tracking: 'high', fields: [{ key: 'remaining', type: 'text' }] },
    { id: 'scene', label: '今晚', kind: 'object', tracking: 'medium', fields: [{ key: 'atmosphere', type: 'text' }] },
    { id: 'records', label: '紀錄', kind: 'collection', tracking: 'medium', fields: [{ key: 'id', type: 'text' }, { key: 'name', type: 'text' }, { key: 'status', type: 'text' }] },
    { id: 'manual', label: '手動', kind: 'object', tracking: 'manual', fields: [{ key: 'text', type: 'text' }] }
  ], modules: { lover: { mood: 'STALE_MOOD', player_note: 'keep' }, contract: { remaining: 'STALE_TIME' }, scene: { atmosphere: 'STALE_SCENE' },
    records: [{ id: 'a', name: '舊項目', status: '進行', manual_note: 'keep' }, { id: 'b', name: '未出現項目', status: '保留' }], manual: { text: '手動內容' } },
    pendingStateTurns: [{ player: '舊', assistant: '舊' }, { player: '離開展會', assistant: '到車旁，契約剩三天，他換上外套。' }] });
  const moduleReply = () => ({ text: JSON.stringify({ ...JSON.parse(reply().text), module_checks: { records: true }, modules: {
    lover: { mood: '安靜' }, contract: { remaining: '三天' }, scene: { atmosphere: '放鬆' },
    records: [{ id: 'a', status: '完成' }, { id: 'c', name: '新項目', status: '新增' }], manual: { text: '惡意覆寫' }, unauthorized: { x: 1 }
  } }) });
  GameState.current = moduleState();
  let saved = 0;
  App.saveStory = () => { saved++; return true; };
  API.send = async (cfg, messages) => { prompt = messages[1].content; assert.equal(cfg.maxOutputTokens, 4096); return moduleReply(); };
  const rawChat = JSON.stringify(Chat.messages);
  await WorldStateEngine.rebuild(App.config);
  assert.equal(GameState.current.modules.lover.mood, '安靜');
  assert.equal(GameState.current.modules.lover.player_note, 'keep');
  assert.equal(GameState.current.modules.contract.remaining, '三天');
  assert.equal(GameState.current.modules.scene.atmosphere, '放鬆');
  assert.equal(GameState.current.modules.records.length, 3);
  assert.equal(GameState.current.modules.records[0].status, '完成');
  assert.equal(GameState.current.modules.records[0].manual_note, 'keep');
  assert.equal(GameState.current.modules.manual.text, '手動內容');
  assert.equal(GameState.current.modules.unauthorized, undefined);
  assert.equal(GameState.current.stateRebuildBackup.modules.contract.remaining, 'STALE_TIME');
  assert.equal(GameState.current.pendingStateTurns.length, 1, 'only covered pairs can leave the backlog');
  assert.equal(GameState.current.stateTracker.phase, 'updated');
  assert.equal(saved, 1, 'rebuild needs no prior manual save, then saves its own result');
  assert.equal(JSON.stringify(Chat.messages), rawChat);
  assert(!prompt.includes('STALE_MOOD') && !prompt.includes('STALE_TIME') && !prompt.includes('STALE_SCENE'));
  assert(prompt.includes('作品模組允許欄位'));

  GameState.current = moduleState();
  API.send = async () => ({ text: JSON.stringify({ ...JSON.parse(reply().text), modules: { lover: { mood: '安靜' } } }) });
  await WorldStateEngine.rebuild(App.config);
  assert.equal(GameState.current.stateTracker.phase, 'partial');
  assert.deepEqual(GameState.current.stateRebuildReport.unconfirmed, ['契約', '今晚', '紀錄']);
  assert.match(GameState.current.stateTracker.message, /尚未確認同步/);
  assert.equal(GameState.current.modules.contract.remaining, 'STALE_TIME');
  assert.equal(GameState.current.pendingStateTurns.length, 2, 'partial rebuild does not discard pending module recovery');

  GameState.current = moduleState();
  API.send = async () => reply();
  await assert.rejects(WorldStateEngine.rebuild(App.config), /作品模組/);
  assert.equal(GameState.current.location, '公寓');
  assert.equal(GameState.current.modules.lover.mood, 'STALE_MOOD');
  API.send = async () => ({ ...moduleReply(), finishReason: 'SAFETY' });
  await assert.rejects(WorldStateEngine.rebuild(App.config), /阻擋/);
  assert.equal(GameState.current.modules.lover.mood, 'STALE_MOOD');

  API.send = () => new Promise(r => { release = r; });
  const modifiedModule = WorldStateEngine.rebuild(App.config);
  GameState.current.modules.contract.remaining = '玩家已更動';
  release(moduleReply());
  await assert.rejects(modifiedModule, /已變更/);
  assert.equal(GameState.current.modules.contract.remaining, '玩家已更動');

  GameState.current = moduleState();
  API.send = async () => moduleReply();
  window.Storage = { flush: async () => { throw new Error('disk full'); } };
  await assert.rejects(WorldStateEngine.rebuild(App.config), /儲存失敗/);
  assert.equal(GameState.current.modules.lover.mood, '安靜', 'keep the in-memory repair available for export');
  assert.equal(GameState.current.stateTracker.phase, 'failed');
  delete window.Storage;
  GameState.current = initial();
  GameState.current = moduleState();
  GameState.current.moduleDefinitions.push({ id: 'private_backstage', label: '不得曝光的秘密名稱', visibility: 'internal', kind: 'object', tracking: 'high', fields: [{ key: 'fact', type: 'text' }] });
  API.send = async () => moduleReply();
  await WorldStateEngine.rebuild(App.config);
  assert.doesNotMatch(GameState.current.stateTracker.message, /不得曝光的秘密名稱/);

  // Empty evidence must neither zero tracked numeric fields nor erase old lists.
  GameState.current = moduleState();
  GameState.current.characterStatuses.小夏.score = 72;
  BAOCharacterStatus.configFor = () => ({ fields: [{ key: 'score', type: 'number', track: true }] });
  API.send = async () => ({ text: JSON.stringify({ ...JSON.parse(reply().text), character_statuses: {}, modules: { records: [] } }) });
  await WorldStateEngine.rebuild(App.config);
  assert.equal(GameState.current.characterStatuses.小夏.score, 72);
  assert.equal(GameState.current.modules.records.length, 2);
  assert.deepEqual(GameState.current.stateRebuildReport.unconfirmedCharacters, ['小夏']);
  assert.equal(GameState.current.stateTracker.phase, 'partial');
  // A queued save is not a durable save; surface verification failure as well.
  window.Storage = { flush: async () => {}, loadStory: () => ({}) };
  window.BAOStorageWriteGuard = { verify: () => ({ ok: false }) };
  await assert.rejects(WorldStateEngine.rebuild(App.config), /儲存失敗/);
  delete window.Storage; delete window.BAOStorageWriteGuard;
  BAOCharacterStatus.configFor = () => ({ fields: [{ key: 'activity', track: true }] });
  GameState.current = initial();
  // A bounded request still contains the newest evidence.
  Chat.messages = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(5000) + i }));
  API.send = async (_, messages) => { prompt = messages[1].content; return reply(); };
  await WorldStateEngine.rebuild(App.config);
  assert(prompt.length < 24000);
  assert(prompt.includes('49'));
  // A 76-turn backlog must be scanned in old-to-new order without touching
  // live game state. Each click permits no more than four paid, bounded batches.
  const pending76 = Array.from({ length: 76 }, (_, i) => ({
    player: `待補玩家第${i + 1}輪`, assistant: `第${i + 1}輪的世界變化`
  }));
  GameState.current = { ...initial(), pendingStateTurns: pending76 };
  Chat.messages = [{ role: 'user', content: '現在要前往醫院' }, { role: 'assistant', content: '抵達醫院' }];
  App.saveStory = () => { saved++; return true; };
  let requests = 0;
  let scanStarts = [];
  API.send = async (cfg, messages) => {
    assert.equal(cfg.__stateTask, true);
    assert.equal(cfg.__auxiliaryTask, true);
    assert.equal(cfg.__stateRebuild, true);
    const content = messages[1].content;
    const match = content.match(/第 (\d+) 輪\\n玩家/);
    assert(match, 'scan must include a numbered source turn');
    scanStarts.push(Number(match[1]));
    requests++;
    return { text: JSON.stringify({ reviewed_turns: 4, facts: [`已核對第${match[1]}輪`] }) };
  };
  let stage = await WorldStateEngine.recoverPending(App.config);
  assert.deepEqual({ ...stage }, { pending: 76, covered: 16, valid: true, ready: false });
  assert.equal(requests, 4, 'one click has a hard four-request ceiling');
  assert.deepEqual(scanStarts, [1, 5, 9, 13], 'scan must be chronological');
  assert.equal(GameState.current.location, '公寓', 'scanning must never rewind the current scene');
  assert.equal(GameState.current.pendingStateTurns.length, 76);
  assert.equal(GameState.current.stateRecovery.covered, 16);

  // A provider block stops immediately; neither the blocked source range nor
  // earlier successful checkpoints are discarded or retried automatically.
  let scanTry = 0;
  API.send = async (cfg, messages) => {
    scanTry++;
    if (scanTry === 2) return { ...reply(), finishReason: 'PROHIBITED_CONTENT' };
    return { text: JSON.stringify({ reviewed_turns: 4, facts: ['有據可查的變化'] }) };
  };
  await assert.rejects(WorldStateEngine.recoverPending(App.config), /內容阻擋/);
  assert.equal(scanTry, 2);
  assert.equal(GameState.current.stateRecovery.covered, 20, 'the first successful batch is durable');
  assert.equal(GameState.current.pendingStateTurns.length, 76);
  assert.equal(GameState.current.location, '公寓');
  const resumed = JSON.parse(JSON.stringify(GameState.current));
  GameState.current = resumed; // simulate reloading the persisted game state
  requests = 0;
  API.send = async (cfg, messages) => {
    requests++;
    const match = messages[1].content.match(/第 (\d+) 輪\\n玩家/);
    return { text: JSON.stringify({ reviewed_turns: 4, facts: [`依原文核對第${match[1]}輪`] }) };
  };
  for (let pass = 0; pass < 5 && !WorldStateEngine.pendingRecoveryStatus().ready; pass++)
    await WorldStateEngine.recoverPending(App.config);
  assert.equal(GameState.current.stateRecovery.covered, 76);
  assert.equal(GameState.current.pendingStateTurns.length, 76);
  assert.equal(GameState.current.time, '02:16');
  assert.equal(requests, 14, 'resume must not rerun the 20 scanned turns');
  assert.equal(WorldStateEngine.pendingRecoveryStatus().ready, true);

  // Reject a blocked final rebuild and preserve both queue and staged evidence.
  API.send = async () => ({ ...reply(), finishReason: 'SAFETY' });
  await assert.rejects(WorldStateEngine.rebuild(App.config, 'deep'), /阻擋/);
  assert.equal(GameState.current.pendingStateTurns.length, 76);
  assert.equal(GameState.current.stateRecovery.covered, 76);
  API.send = async (cfg, messages) => {
    assert.match(messages[1].content, /已逐批核對的待補歷史/);
    assert.match(messages[1].content, /73～76輪/);
    return reply();
  };
  await WorldStateEngine.rebuild(App.config, 'deep');
  assert.equal(GameState.current.location, '醫院');
  assert.equal(GameState.current.pendingStateTurns.length, 0);
  assert.equal(GameState.current.stateRecovery, null);
  assert.equal(GameState.current.stateRebuildReport.recoveryCompleted, true);

  // Changed source invalidates an old checkpoint; reset only clears the scan.
  GameState.current = { ...initial(), pendingStateTurns: pending76.slice(0, 8) };
  API.send = async () => ({ text: JSON.stringify({ reviewed_turns: 4, facts: [] }) });
  await WorldStateEngine.recoverPending(App.config);
  GameState.current.pendingStateTurns[0] = { player: '已被編輯', assistant: '玩家修改了原文' };
  assert.equal(WorldStateEngine.pendingRecoveryStatus().valid, false);
  await assert.rejects(WorldStateEngine.recoverPending(App.config), /重設掃描/);
  await WorldStateEngine.resetPendingRecovery();
  assert.equal(GameState.current.stateRecovery, null);
  assert.equal(GameState.current.pendingStateTurns.length, 8);

  // Persistence failures must roll back only checkpoint progress, not the story.
  App.saveStory = () => false;
  API.send = async () => ({ text: JSON.stringify({ reviewed_turns: 4, facts: [] }) });
  await assert.rejects(WorldStateEngine.recoverPending(App.config), /儲存未確認/);
  assert.equal(GameState.current.stateRecovery, null);
  assert.equal(GameState.current.pendingStateTurns.length, 8);
  assert.equal(GameState.current.location, '公寓');
  App.saveStory = () => true;

  console.log('world state rebuild core tests passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
