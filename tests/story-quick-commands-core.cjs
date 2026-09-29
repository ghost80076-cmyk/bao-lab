const assert = require("node:assert/strict");
const core = require("../js/story-quick-commands-core.js");

assert.equal(core.BUILT_INS.length, 6);
assert.equal(core.BUILT_INS[0].label, "繼續描寫");

{
  const command = core.normalizeCommand("放慢節奏", 0, "player");
  assert.equal(command.label, "放慢節奏");
  assert.equal(command.text, "放慢節奏");
  assert.equal(command.source, "player");
}

{
  const character = {
    quick_commands: [
      { id: "look", label: "觀察四周", text: "先觀察四周，不急著行動。" },
      "詢問目前時間"
    ],
    gameplay: {
      quick_commands: [{ id: "extra", label: "作品指令", prompt: "依作品規則推進下一個場景。" }]
    }
  };
  const items = core.authorCommands(character);
  assert.equal(items.length, 3);
  assert.equal(items[0].source, "author");
  assert.equal(items[1].label, "詢問目前時間");
  assert.equal(items[2].text, "依作品規則推進下一個場景。");
}

{
  const custom = Array.from({ length: 20 }, (_, index) => ({
    id: "c" + index,
    label: "自訂 " + index,
    text: "內容 " + index
  }));
  assert.equal(core.customCommands(custom).length, core.MAX_CUSTOM);
}

{
  const duplicate = core.BUILT_INS[0].text;
  const all = core.allCommands(
    { quick_commands: [{ label: "重複", text: duplicate }, { label: "作品限定", text: "作品限定文字" }] },
    [{ label: "玩家重複", text: duplicate }, { label: "玩家限定", text: "玩家限定文字" }]
  );
  assert.equal(all.filter(item => item.text === duplicate).length, 1);
  assert.equal(all.some(item => item.text === "作品限定文字"), true);
  assert.equal(all.some(item => item.text === "玩家限定文字"), true);
}

{
  const info = core.summary(
    { quick_commands: [{ label: "作品限定", text: "作品限定文字" }] },
    [{ label: "我的指令", text: "我的文字" }]
  );
  assert.equal(info.title, "8 個快捷指令");
  assert.match(info.detail, /作品 1/);
  assert.match(info.detail, /我的 1/);
  assert.match(info.detail, /不會自動送出/);
}

console.log("story quick commands core test passed");
