const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };

const characterCode = fs.readFileSync(path.join(__dirname, "..", "js", "character.js"), "utf8");
vm.runInThisContext(characterCode, { filename: "js/character.js" });

const card = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "characters", "general", "linchenfeng.json"), "utf8"));
const modePrompt = "以主要角色與玩家之間的互動為敘事核心。優先描寫表情、動作、停頓、語氣、距離與情緒變化。避免無必要地生成大量 NPC 或支線。讓關係自然發展，不強制推進。";
const prompt = CharacterEngine.composeSystemPrompt(card, {
  persona: { name: "玩家", gender: "女性", identity: "未指定", personality: "未指定", relationship: "陌生人", extra: "無" },
  modePrompt,
  displayMode: "text"
});

function tokenRange(text) {
  let cjk = 0, ascii = 0, other = 0;
  for (const ch of String(text || "")) {
    if (/\s/.test(ch)) continue;
    if (/[\u4e00-\u9fff]/.test(ch)) cjk += 1;
    else if (ch.charCodeAt(0) < 128) ascii += 1;
    else other += 1;
  }
  return {
    low: Math.round(cjk * 0.65 + ascii / 5 + other * 0.5),
    mid: Math.round(cjk * 0.85 + ascii / 4 + other * 0.7),
    high: Math.round(cjk * 1.10 + ascii / 3 + other)
  };
}

const estimate = tokenRange(prompt);
assert.equal(card.meta.category, "female");
assert.equal(card.meta.gender, "male");
assert.ok(card.content.system_prompt.includes("【親密與性互動】"));
assert.ok(prompt.length <= 4600, `static prompt grew to ${prompt.length} chars`);
assert.ok(estimate.high <= 4800, `estimated high token budget grew to ${estimate.high}`);

console.log(`Lin Chenfeng static prompt: ${prompt.length} chars; estimated ${estimate.low}-${estimate.high} input tokens (mid ${estimate.mid})`);
