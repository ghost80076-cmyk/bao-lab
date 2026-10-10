const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const core = require("../js/story-actor-pack-core.js");

function readPack(file, globalName) {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: file });
  return sandbox.window[globalName];
}

const general = readPack("story-actors-general-pack.js", "BAOGeneralStoryActorPack");
const adult = readPack("story-actors-adult-pack.js", "BAOAdultStoryActorPack");

assert.deepEqual(Array.from(general.actors, item => item.id), ["jingyue", "guchen"]);
assert.deepEqual(Array.from(adult.actors, item => item.id), ["jiuyue", "shuanger"]);

{
  const visible = core.availableCatalog(general.actors, adult.actors, { adultEnabled: false });
  assert.deepEqual(visible.map(item => item.id), ["jingyue", "guchen"]);
  assert.ok(visible.every(item => item.rating === "general"));
}

{
  const visible = core.availableCatalog(general.actors, adult.actors, { adultEnabled: true });
  assert.deepEqual(visible.map(item => item.id), ["jingyue", "guchen", "jiuyue", "shuanger"]);
}

{
  const jingyue = core.instantiate(general.actors[0], {
    identity: "魔法學院轉學生",
    relationship: "玩家好友的未婚妻",
    personality: "本場演成天真、對玩家沒有戒心",
    role: "additional"
  }, { id: "runtime-jingyue" });
  assert.equal(jingyue.id, "runtime-jingyue");
  assert.equal(jingyue.portable.packId, "jingyue");
  assert.equal(jingyue.relationship, "玩家好友的未婚妻");
  const prompt = core.portablePrompt(jingyue);
  assert.match(prompt, /演員層/);
  assert.match(prompt, /彼此之間、與原作品 NPC 之間/);
  assert.match(prompt, /不要因為可攜角色加入就覆蓋原作人物/);
}

{
  const guchen = core.instantiate(general.actors[1], {
    identity: "宮廷談判官",
    relationship: "玩家的競爭對手"
  }, { id: "runtime-guchen" });
  assert.equal(guchen.portable.actorMode, false);
  assert.match(core.portablePrompt(guchen), /不是演員容器/);
  assert.match(guchen.portable.core, /不是讀心/);
  assert.match(guchen.portable.core, /可能誤判/);
}

{
  const jiuyue = core.instantiate(adult.actors[0], {}, { id: "runtime-jiuyue" });
  assert.equal(jiuyue.portable.rating, "adult");
  assert.match(jiuyue.portable.core, /停止.*立即停止|立即停止.*停止/);
  assert.match(jiuyue.portable.core, /戲外的服從關係不能偷渡/);
}

{
  const shuanger = core.instantiate(adult.actors[1], {}, { id: "runtime-shuanger" });
  assert.equal(shuanger.portable.rating, "adult");
  assert.match(shuanger.portable.core, /不能讀取具體思想/);
  assert.match(shuanger.portable.core, /永遠不能凌駕停止/);
  assert.doesNotMatch(shuanger.portable.core, /她知道你在想什麼/);
}

{
  const pack = readPack("three-realms-story-actor-pack.js", "BAOThreeRealmsStoryActorPack");
  const provenance = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/three-realms-actor-provenance.json")));
  const crypto = require("node:crypto");
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  assert.equal(pack.actors.length, 31);
  assert.equal(new Set(pack.actors.map(actor => actor.id)).size, 31);
  assert.ok(!pack.actors.some(actor => actor.id.endsWith("-24")));
  for (const actor of pack.actors) {
    const record = provenance.records.find(record => record.actor_id === actor.id);
    assert.equal(crypto.createHash("sha256").update(JSON.stringify(canonical(actor))).digest("hex"), record.actor_sha256);
    assert.equal(actor.rating, "general");
    assert.equal(actor.actorMode, false);
    assert.equal(actor.defaults.relationship, "");
    const instance = core.instantiate(actor, { identity: "本場同行" }, { id: "instance" });
    instance.name = "玩家改名";
    assert.notEqual(actor.name, instance.name);
    assert.match(core.portablePrompt(instance), /不是演員容器/);
    assert.equal(actor.defaults.identity, "");
  }
  const visible = core.availableCatalog([...general.actors, ...pack.actors], adult.actors, {adultEnabled:false});
  assert.equal(visible.length, 33);
  assert.ok(visible.every(actor => actor.rating === "general"));
}

console.log("story actor pack core: portable actors, adult gate and character boundaries passed");
