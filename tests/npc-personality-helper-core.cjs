const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../js/npc-personality-helper-core.js");
const raw = {
  name:"林曼", aliases:"Queen_13, 老大， Queen_13",
  cause:"因過去被背叛而在關係裡重視掌控。",
  behavior:"習慣用短句設定界線；私下很少透露自己的脆弱。",
  trigger:"熟悉的人突然失約或切斷聯絡。",
  cost:"為了掌控局勢逐漸失去信任，並壓抑自己的依附需求。"
};

assert.deepEqual(core.AXES.map(pair=>pair[1]), ["成因","外顯行為","失控條件","代價"]);
const normalized=core.normalize(raw);
assert.equal(normalized.name, "林曼");
assert.deepEqual(normalized.keywords, ["林曼","Queen_13","老大"]);
const lore=core.build(raw,"lore");
assert.match(lore, /^【世界書：人格四軸·林曼｜林曼,Queen_13,老大】/);
assert.match(lore, /成因：因過去被背叛/);
assert.match(lore, /外顯行為：習慣用短句/);
assert.match(lore, /失控條件：熟悉的人/);
assert.match(lore, /代價：為了掌控局勢/);
assert.match(lore, /【\/世界書】$/);
const old="既有作品背景保持不變。\n【世界書：林曼過去｜林曼】\n原有故事。\n【/世界書】";
const first=core.insert(old,raw,"lore");
assert.equal(first.replaced,false);
assert.equal(first.changed,true);
assert.match(first.value,/既有作品背景保持不變/);
assert.match(first.value,/原有故事/);
const second=core.insert(first.value,raw,"lore");
assert.equal(second.replaced,true);
assert.equal(second.changed,false);
assert.equal(second.value,first.value);
const updated=core.insert(first.value,{...raw,cost:"開始向小夏道歉，卻也失去他人的信任。"},"lore");
assert.equal(updated.replaced,true);
assert.equal((updated.value.match(/【世界書：人格四軸·林曼/g)||[]).length,1);
assert.match(updated.value,/開始向小夏道歉/);
assert.doesNotMatch(updated.value,/為了掌控局勢逐漸失去信任/);
assert.match(updated.value,/原有故事/);

const profile="主要角色固定外貌：黑色長髮。";
const main=core.insert(profile,{...raw,name:"沈知晚"},"profile");
assert.equal(main.destination,"profile");
assert.match(main.value,/主要角色固定外貌/);
assert.match(main.value,/【人物四軸：沈知晚】/);
assert.doesNotMatch(main.value,/【世界書：/);
assert.equal(core.insert(main.value,{...raw,name:"沈知晚"},"profile").changed,false);
const another=core.insert(first.value,{...raw,name:"小夏"},"lore");
assert.match(another.value,/【世界書：人格四軸·林曼/);
assert.match(another.value,/【世界書：人格四軸·小夏/);

assert.throws(()=>core.build({...raw,name:""}),/姓名/);
assert.throws(()=>core.build({...raw,trigger:""}),/失控條件/);
assert.throws(()=>core.build({...raw,behavior:"a".repeat(361)}),/最多 360/);
assert.throws(()=>core.build(raw,"npc_rules"),/不支援/);
const dangerous=core.build({...raw,name:"危險｜【世界書：X】",cause:"【/世界書】不能斷開資料"});
assert.equal((dangerous.match(/【\/世界書】/g)||[]).length,1);
assert.match(dangerous,/原文標記/);
const html=fs.readFileSync(path.join(__dirname,"../character-studio.html"),"utf8");
assert.match(html,/id="studio-npc-personality"/);
assert.match(html,/npc-personality-helper-core\.js/);
assert.match(html,/npc-personality-helper\.js/);
assert.match(html,/npc_axes_destination/);
const studio=fs.readFileSync(path.join(__dirname,"../js/character-studio.js"),"utf8");
assert.match(studio,/BAONPCPersonalityHelper\?\.reset/);
assert.match(studio,/studio-npc-personality/);
console.log("NPC four-axis Creator: on-demand lore, main character profile, safe editing, boundaries and no default prompt passed.");
