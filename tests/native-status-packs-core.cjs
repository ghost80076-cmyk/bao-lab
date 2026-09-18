const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag, text = '') { this.tagName = tag; this.own = text; this.children = []; this.dataset = {}; this.listeners = {}; }
  append(...items) { this.children.push(...items); }
  prepend(...items) { this.children.unshift(...items); }
  replaceChildren(...items) { this.own = ''; this.children = [...items]; }
  set textContent(value) { this.own = String(value); this.children = []; }
  get textContent() { return this.own + this.children.map(x => x.textContent ?? String(x)).join(''); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelector(selector) { if (selector === '.bao-native-status-board') return this.children.find(x => x.className === 'bao-native-status-board') || null; return null; }
}
const elements = { body: new Element('body'), head: new Element('head') };
const config = { customFields: [], hidden: [], order: [], labels: {} };
const state = { time: '22:14', location: '巷口', events: ['新事件', '第二件', '第三件', '第四件'], npcs: [{ name: '林慕晴', location: '巷口' }, { name: '凱倫', location: '酒館' }, { name: '莉莉', location: '未知' }], characterStatuses: {} };
let saves = 0, renders = 0, confirmations = 0;
const sandbox = {
  document: { body: elements.body, head: elements.head, createElement: tag => new Element(tag), createTextNode: value => new Element('#text', String(value)), getElementById: () => null, querySelector: () => null },
  MutationObserver: class { observe() {} },
  queueMicrotask: fn => fn(),
  App: { activeCharacter: { id: 'autonomous-npc-world', name: '自主NPC世界' }, config: { persona: { name: '玩家甲', identity: '旅人' } }, escapeHTML: String, renderUIPanel() { renders++; }, renderChatShell() {}, saveStory() { saves++; } },
  GameState: { current: state, applyUpdate(patch) { Object.assign(this.current, patch); } },
  BAOCharacterStatus: { MAX_CUSTOM_FIELDS: 24, configFor() { const c = state.characterStatusCustomization || config; return { fields: c.customFields, customization: c }; }, getCustomization() { return JSON.parse(JSON.stringify(state.characterStatusCustomization || config)); }, applyCustomization(c) { state.characterStatusCustomization = c; for (const npc of state.npcs) { const values = state.characterStatuses[npc.name] ||= {}; for (const field of c.customFields) values[field.key] ??= field.default; } } },
  confirm() { confirmations++; return true; }, alert() {}
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync('js/native-status-packs.js', 'utf8'), sandbox, { filename: 'js/native-status-packs.js' });
const pack = sandbox.BAONativeStatusPacks;
assert.ok(pack && !pack.enabled());
assert.equal(pack.applyPack(), true);
assert.equal(pack.enabled(), true);
assert.equal(saves, 1);
assert.equal(confirmations, 1);
assert.equal(state.characterStatusCustomization.customFields.length, 8);
assert.equal(state.characterStatuses['林慕晴'].sexual_desire, -1);
assert.equal(state.characterStatusCustomization.customFields.find(f => f.key === 'sexual_desire').track, true);
let sections = pack.getSections();
assert.deepEqual(Array.from(sections, s => s.children[0].textContent), ['👤 玩家資料', '👥 當前場景 NPC', '🚪 離場 NPC', '❔ 位置待確認', '⚠️ 最近三條狀態日誌']);
assert.match(sections[1].textContent, /林慕晴/);
assert.match(sections[2].textContent, /凱倫/);
assert.match(sections[3].textContent, /莉莉/);
assert.match(sections[1].textContent, /性慾值：未知/);
assert.doesNotMatch(sections[4].textContent, /第四件/);
state.characterStatuses['林慕晴'].sexual_desire = 0;
sections = pack.getSections();
assert.match(sections[1].textContent, /性慾值：0/);
state.characterStatuses['林慕晴'].sexual_desire = 42;
sections = pack.getSections();
assert.match(sections[1].textContent, /性慾值：42/);
assert.equal(state.characterStatuses['凱倫'].sexual_desire, -1);
sandbox.App.activeCharacter.id = 'other';
assert.equal(pack.getSections(), null);
assert.equal(pack.applyPack(), false);
console.log('Native status pack PASS: explicit opt-in, 8 tracked fields, independent NPCs, unknown vs 0, grouped presence, 3 logs, world-only, saved');
