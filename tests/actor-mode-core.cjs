const assert = require("node:assert/strict");
const core = require("../js/actor-mode-core.js");

{
  const state = core.normalizeState({}, {
    enabled: true,
    role_active: false,
    default_role: { label: "陌生旅伴", identity: "來自另一座城市。" }
  });
  assert.equal(state.enabled, true);
  assert.equal(state.roleActive, false);
  assert.equal(state.role.label, "陌生旅伴");
}

{
  const prompt = core.buildPrompt({
    state: {
      enabled: true,
      roleActive: true,
      role: {
        label: "有戒心的新鄰居",
        identity: "剛搬來三天。",
        relationship: "只見過兩次。",
        personality: "不輕易信任別人。",
        knowledge: "不知道玩家的私人過去。"
      }
    },
    actorName: "鏡月"
  });
  assert.match(prompt, /Meta Knowledge 不等於 Character Knowledge/);
  assert.match(prompt, /角色具有慣性/);
  assert.match(prompt, /有戒心的新鄰居/);
  assert.match(prompt, /不知道玩家的私人過去/);
}

{
  const disabled = core.buildPrompt({ state: { enabled: false } });
  assert.equal(disabled, "");
}

{
  const stop = core.command("【停止扮演】");
  const next = core.applyCommand({
    enabled: true,
    roleActive: true,
    role: { label: "上司" }
  }, stop);
  assert.equal(next.enabled, true);
  assert.equal(next.roleActive, false);
  assert.equal(next.role.label, "上司");
}

{
  const clear = core.applyCommand({
    enabled: true,
    roleActive: true,
    role: { label: "上司", identity: "部門主管" }
  }, core.command("【清除戲中角色】"));
  assert.equal(clear.roleActive, false);
  assert.equal(clear.role.label, "");
  assert.equal(clear.role.identity, "");
}

{
  const jingyue = require("../data/characters/general/jingyue-actor.json");
  const guchen = require("../data/characters/general/guchen-autonomous.json");
  const jiuyue = require("../data/characters/adult/jiuyue-actor.json");
  const shuanger = require("../data/characters/adult/shuanger-succubus-actor.json");

  assert.equal(jingyue.rating, "general");
  assert.equal(jingyue.actor_mode.enabled, true);

  assert.equal(guchen.rating, "general");
  assert.equal(guchen.actor_mode, undefined);
  assert.match(guchen.system_prompt, /不是讀心/);
  assert.match(guchen.system_prompt, /可能誤解/);

  assert.equal(jiuyue.rating, "adult");
  assert.equal(jiuyue.category, "male");
  assert.equal(jiuyue.actor_mode.enabled, true);
  assert.match(jiuyue.system_prompt, /停止.*立即停止|立即停止.*停止/);
  assert.match(jiuyue.system_prompt, /戲中人物.*不會.*自動服從/);

  assert.equal(shuanger.rating, "adult");
  assert.equal(shuanger.category, "male");
  assert.equal(shuanger.actor_mode.enabled, true);
  assert.match(shuanger.system_prompt, /不是讀心/);
  assert.match(shuanger.system_prompt, /不能直接讀取具體思想/);
  assert.match(shuanger.system_prompt, /停止永遠先執行/);
  assert.doesNotMatch(shuanger.system_prompt, /她知道你在想什麼/);
  assert.doesNotMatch(shuanger.system_prompt, /病嬌狀態不受解除詞影響/);
}

console.log("actor mode core test passed");
