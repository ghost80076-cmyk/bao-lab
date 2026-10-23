const assert = require("node:assert/strict");
const core = require("../js/story-quick-commands-core.js");

assert.equal(core.BUILT_INS.length, 7);
const clarify = core.BUILT_INS.find(item => item.id === "clarify");
assert.equal(clarify?.label, "釐清目前局勢");
assert.match(clarify.text, /【本輪故事內釐清】/);
assert.match(clarify.text, /在場人物合乎其知情範圍/);
assert.match(clarify.text, /不能知道的就保留未知/);
assert.match(clarify.text, /不替我做決定/);
assert.match(clarify.text, /僅限本輪/);
assert.ok(clarify.text.length <= core.MAX_TEXT);
assert.equal(core.BUILT_INS.filter(item => item.id === "clarify").length, 1);
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
  assert.equal(info.title, "9 個快捷指令");
  assert.match(info.detail, /作品 1/);
  assert.match(info.detail, /我的 1/);
  assert.match(info.detail, /不會自動送出/);
}


{
  const source = [{ id:"local-1", label:"第三人稱", text:"請維持第三人稱敘事。" },
    { id:"local-2", label:"帶金鑰", text:"請保持當前動作連貫。" }];
  const bundle = core.exportPack(source);
  assert.equal(bundle.schema, core.PACK_SCHEMA);
  assert.equal(bundle.version, 1);
  assert.deepEqual(bundle.commands.map(x => x.label), ["第三人稱","帶金鑰"]);
  assert.deepEqual(Object.keys(bundle.commands[0]), ["label","text"]);
  assert.doesNotMatch(JSON.stringify(bundle), /"id"|"source"|"apiKey"|"persona"/);
  const parsed = core.parsePack(JSON.stringify(bundle));
  assert.deepEqual(parsed, bundle);
  const merged = core.mergePack([{id:"local-1", label:"保留",text:"既有私人指令"}],parsed);
  assert.equal(merged.added,2);
  assert.equal(merged.duplicates,0);
  assert.equal(merged.overflow,0);
  assert.equal(merged.commands.length,3);
  assert.equal(merged.commands[0].id,"local-1");
  assert.equal(merged.commands[1].source,undefined);
  const again = core.mergePack(merged.commands,parsed);
  assert.equal(again.added,0);
  assert.equal(again.duplicates,2);
  assert.deepEqual(again.commands, merged.commands);
  const busy = Array.from({length:11},(_,i)=>({id:"local-"+i,label:"已有 "+i,text:"本地 "+i}));
  const overflow = core.mergePack(busy,parsed);
  assert.equal(overflow.added,1);
  assert.equal(overflow.overflow,1);
  assert.equal(overflow.commands.length,12);
  const built = core.mergePack([], {
    schema:core.PACK_SCHEMA,version:1,
    commands:[{label:"繼續",text:core.BUILT_INS[0].text}]
  },core.BUILT_INS);
  assert.equal(built.added,0);
  assert.equal(built.duplicates,1);
  assert.throws(()=>core.parsePack({schema:"unknown",version:1,commands:[]}),/不是夜灣/);
  assert.throws(()=>core.parsePack({schema:core.PACK_SCHEMA,version:2,commands:[]}),/不是夜灣/);
  assert.throws(()=>core.parsePack({schema:core.PACK_SCHEMA,version:1,commands:[]}),/1～12/);
  assert.throws(()=>core.parsePack({schema:core.PACK_SCHEMA,version:1,commands:[{label:"短",text:"x".repeat(601)}]}),/內容無效/);
  assert.throws(()=>core.parsePack({schema:core.PACK_SCHEMA,version:1,commands:[{label:"x",text:"same"},{label:"y",text:"same"}]}),/重複/);
  assert.throws(()=>core.parsePack({schema:core.PACK_SCHEMA,version:1,commands:[{label:"x",text:"a"}],extra:"x".repeat(core.MAX_IMPORT_BYTES)}),/大小上限/);
}

console.log("story quick commands core test passed");
