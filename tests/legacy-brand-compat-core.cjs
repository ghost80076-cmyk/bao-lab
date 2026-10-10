const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const load = relative => vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'),
  { filename: relative }
);
const fixtures = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'legacy-bao-lab', 'compatibility-fixtures.json'),
  'utf8'
));

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

global.window = global;
global.localStorage = new MemoryStorage();
global.indexedDB = undefined;
global.alert = () => {};
global.confirm = () => true;
global.setInterval = () => 1;
global.clearInterval = () => {};

load('js/storage.js');
global.Storage = Storage;

(async () => {
  // 1. Old single-story saves keep their internal BAO/LAB schema and remain readable.
  const story = Storage.sanitizeImportedStory(fixtures.story);
  assert.equal(story.schema, 'bao-lab-story');
  assert.equal(story.version, 1);
  assert.equal(story.characterId, 'legacy-character');
  assert.equal(story.chat.messages.length, 2);
  assert.equal(story.state.location, '舊港口');
  assert.equal(story.config.api.key, '', 'legacy API keys must be cleared on import');

  // Very early saves without schema/version are still normalized into the current internal format.
  const schemaLess = structuredClone(fixtures.story);
  delete schemaLess.schema;
  delete schemaLess.version;
  const normalizedEarlyStory = Storage.sanitizeImportedStory(schemaLess);
  assert.equal(normalizedEarlyStory.schema, 'bao-lab-story');
  assert.equal(normalizedEarlyStory.version, 1);

  const captureImportError = payload => {
    try { Storage.sanitizeImportedStory(payload); }
    catch (error) { return error; }
    return null;
  };
  const nativeCardError = captureImportError({
    schema_version: '1.5',
    meta: { id: 'creator-card', name: 'Creator Card' },
    content: { greeting: '開場', system_prompt: '角色核心' }
  });
  assert.ok(nativeCardError);
  assert.equal(nativeCardError.code, 'YORUBAY_CHARACTER_CARD_IN_STORY_IMPORT');
  assert.match(nativeCardError.message, /作品 → 本機角色與匯入/);

  const v2CardError = captureImportError({
    spec: 'chara_card_v2',
    data: { name: '酒館角色' }
  });
  assert.ok(v2CardError);
  assert.equal(v2CardError.code, 'YORUBAY_CHARACTER_CARD_IN_STORY_IMPORT');

  const creatorReportError = captureImportError({
    source_format: 'character-card-v2',
    draft: { name: '尚未匯出的角色' },
    capability_audit: { worldbook: '已轉換' }
  });
  assert.ok(creatorReportError);
  assert.equal(creatorReportError.code, 'YORUBAY_CREATOR_REPORT_IN_STORY_IMPORT');
  assert.match(creatorReportError.message, /還不是可匯入檔案/);

  // 2. Full story bundles exported under the BAO/LAB name remain valid.
  global.BAOStoryLibrary = {};
  load('js/story-backup.js');
  const bundle = BAOStoryBackup.sanitizeBundle(fixtures.bundle);
  assert.equal(bundle.schema, 'bao-lab-story-bundle');
  assert.equal(bundle.version, 1);
  assert.equal(bundle.chapters.length, 1);
  assert.equal(bundle.chapters[0].payload.chat.summary, '舊主線摘要');
  assert.equal(bundle.chapters[0].payload.config.api.key, '', 'bundle imports must also clear API keys');

  // 3. BAO/LAB 1.x character JSON remains accepted by the YoruBay import path.
  delete global.document;
  load('js/character.js');
  global.CharacterEngine = CharacterEngine;
  CharacterEngine.audit = () => ({ ok: true, errors: [] });
  load('js/character-import-upgrade.js');
  const oldCharacterFile = {
    size: Buffer.byteLength(JSON.stringify(fixtures.character)),
    text: async () => JSON.stringify(fixtures.character)
  };
  const prepared = await BAOCharacterImport.prepareFile(oldCharacterFile);
  assert.equal(prepared.converted, false);
  assert.equal(prepared.format, 'BAO/LAB JSON', 'internal legacy format label stays stable for compatibility');
  assert.equal(prepared.character.id, 'legacy-character');
  assert.equal(prepared.character.schema_version, '1.0');
  assert.equal(prepared.character.greeting, '這是一張舊版角色卡。');
  assert.equal(prepared.character.initial_state.location, '舊港口');

  // 4. Old device-transfer packages are identified by schema, not by the new public brand name.
  load('js/device-transfer.js');
  const transfer = BAODeviceTransfer.validate(fixtures.deviceTransfer);
  assert.equal(transfer.schema, 'bao-lab-device-transfer');
  assert.equal(transfer.version, 1);
  assert.equal(transfer.app, 'BAO/LAB');

  // 5. Old Context Packs are still parsed, but player confirmation is intentionally reset.
  global.document = {
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return {}; },
    head: { appendChild() {} },
    body: { appendChild() {} }
  };
  global.setTimeout = () => 0;
  global.App = {
    activeCharacter: { id: 'legacy-character', name: '舊角色' },
    config: {},
    buildSystemPrompt() { return 'base'; },
    renderChatShell() {},
    escapeHTML(value) { return String(value); }
  };
  global.Chat = { messages: [] };
  global.GameState = { current: {} };
  load('js/story-tools.js');
  const parsedPack = BAOStoryTools.parseExternalText(JSON.stringify(fixtures.contextPack));
  assert.equal(parsedPack.report.format, 'BAO/LAB Context Pack');
  assert.equal(parsedPack.pack.schema, 'bao-lab-context-pack');
  assert.equal(parsedPack.pack.source.platform, 'BAO/LAB');
  assert.equal(parsedPack.pack.summary, '這是舊版摘要。');
  assert.equal(parsedPack.pack.playerConfirmed, false, 'imported legacy packs must be reviewed again');

  console.log('Legacy BAO/LAB -> YoruBay compatibility regression passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
