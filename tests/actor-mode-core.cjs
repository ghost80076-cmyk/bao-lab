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

console.log("actor mode core test passed");

// Opening the unified tool hub may read this summary; it must not initialize story state.
{
  const fs=require('node:fs'),vm=require('node:vm');
  const c={App:{activeCharacter:{name:'測試',actor_mode:{enabled:true,role_active:true,default_role:{label:'鄰居'}}}},GameState:{current:{}},BAOActorModeCore:core,
    document:{body:{},querySelector:()=>null},MutationObserver:class{observe(){}}};c.window=c;vm.createContext(c);
  vm.runInContext(fs.readFileSync('js/actor-mode.js','utf8'),c);
  assert.equal(c.BAOActorMode.summary().roleLabel,'鄰居');assert.deepEqual(c.GameState.current,{});
  const legacy={enabled:false,role:{label:'草稿'}};c.GameState.current.actorMode=legacy;
  const before=JSON.stringify(c.GameState.current);c.BAOActorMode.summary();
  assert.equal(JSON.stringify(c.GameState.current),before);assert.equal(c.GameState.current.actorMode,legacy);
}
