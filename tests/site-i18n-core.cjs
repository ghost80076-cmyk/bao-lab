"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = name => fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8");
const storage = new Map();
const text = (value, skipped = false) => {
  const parentElement = { closest: () => skipped ? {} : null };
  return { nodeType: 3, nodeValue: value, parentElement };
};
const ui = text("首頁");
const sent = text("送出");
const story = text("首頁", true);
const character = text("我的", true);
const implicitLabel = text("男性");
const explicitLabel = text("女性");
const implicitOption = { nodeType: 1, tagName: "OPTION", closest: () => null,
  hasAttribute: () => false, childNodes: [implicitLabel] };
const explicitOption = { nodeType: 1, tagName: "OPTION", closest: () => null,
  hasAttribute: attr => attr === "value", childNodes: [explicitLabel] };
const container = { nodeType: 1, closest: () => null, hasAttribute: () => false,
  childNodes: [ui, sent, story, character, implicitOption, explicitOption] };
const doc = {
  readyState: "loading", documentElement: { lang: "zh-Hant" },
  addEventListener() {},
  getElementById() { return null; },
  querySelectorAll(selector) { return selector.includes(".topbar,") ? [container] : []; },
  querySelector() { return null; }
};
const win = { addEventListener() {}, dispatchEvent() {} };
const ctx = vm.createContext({
  window: win, document: doc, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); }
  }
});
vm.runInContext(read("site-i18n.js"), ctx, { filename: "site-i18n.js" });
const i18n = win.BAOSiteI18n;
assert.ok(i18n, "interface module must initialize without touching the AI");
assert.equal(i18n.getLocale(), "zh-Hant");
assert.equal(i18n.t("首頁"), "首頁");
assert.equal(i18n.setLocale("en"), "en");
assert.equal(ui.nodeValue, "Home");
assert.equal(sent.nodeValue, "Send");
assert.equal(story.nodeValue, "首頁", "author/player chat content must remain untouched");
assert.equal(implicitLabel.nodeValue, "男性", "implicit option values must not change");
assert.equal(explicitLabel.nodeValue, "Female", "options with stable values may localize");
assert.equal(character.nodeValue, "我的", "character content must remain untouched");
assert.equal(doc.documentElement.lang, "en");
assert.equal(storage.get(i18n.storageKey), "en");
assert.equal(i18n.t("AI 回覆語言"), "AI response language");

assert.equal(i18n.setLocale("zh-Hans"), "zh-Hans");
assert.equal(ui.nodeValue, "首页");
assert.equal(sent.nodeValue, "发送");
assert.equal(i18n.t("網站介面語言"), "网站界面语言");
assert.equal(i18n.setLocale("zh-Hant"), "zh-Hant");
assert.equal(ui.nodeValue, "首頁", "switch must restore original copy");
assert.equal(sent.nodeValue, "送出");
assert.equal(i18n.setLocale("other"), "zh-Hant", "unknown locales fall back safely");

ctx.Chat = { messages: [] };
ctx.App = {
  activeCharacter: { name: "測試角色" }, config: { persona: { name: "玩家" } },
  buildSystemPrompt() { return "BASE"; }, collectConfig() { return {}; },
  openBuilder() {}, startStory() {}, sendMessage() {}, renderChatShell() {},
  escapeHTML: String, escapeAttr: String
};
ctx.setTimeout = () => {};
vm.runInContext(read("player-settings.js"), ctx, { filename: "player-settings.js" });
const prefs = win.BAOPlayerSettings;
assert.ok(prefs, "AI reply settings still initialize independently");
prefs.set({ language: "en" });
assert.equal(prefs.getLanguage(), "en");
assert.equal(i18n.setLocale("zh-Hans"), "zh-Hans");
assert.equal(prefs.getLanguage(), "en", "interface changes must not alter AI reply language");
assert.match(ctx.App.buildSystemPrompt(), /All natural-language replies must be in English/);
prefs.set({ language: "zh-Hant" });
assert.equal(i18n.getLocale(), "zh-Hans", "AI reply changes must not alter interface language");
assert.match(ctx.App.buildSystemPrompt(), /所有自然語言回覆使用繁體中文/);
assert.equal(storage.get("yorubay:interface-language"), "zh-Hans");
assert.equal(JSON.parse(storage.get("bao-lab:player-settings")).language, "zh-Hant");

for (const page of ["index.html", "account.html", "author.html", "quick-start.html"]) {
  const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
  assert.match(html, /js\/site-i18n\.js\?v=2/, page + " should load interface localization");
  assert.match(html, /css\/site-i18n\.css\?v=1/, page + " should style the interface switch");
  if (page === "index.html") assert.match(html, /<option value="男性">男性<\/option>/,
    "gender form values must remain stable while visible labels change");
}
const source = read("site-i18n.js");
assert.match(source, /#chat-stream/);
assert.match(source, /#character-list/);
assert.match(source, /#character-detail/);
assert.match(source, /#chat-character-card/);
assert.match(source, /#ui-panel/);
assert.match(source, /#home-local-story-preview/);
assert.match(source, /#home-feature-title/);
console.log("PASS independent UI/story languages: 3 locales, persistence, reverse switching, author/player isolation and entrypoints");
