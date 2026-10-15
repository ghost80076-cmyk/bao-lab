const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const core = require("../js/worldbook-library-core.js");
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/worldbook-library.json"), "utf8"));
let saves = 0, calls = 0;
const GameState = { current: { location: "中央商業區", npcs: [], events: [], worldbookLibrary: {
  version: 1, enabled: ["sunrise-geography-demo"], installed: [], pinned: {}
} } };
const Chat = { messages: [{ role: "user", content: "我到中央商業區了" }] };
const App = {
  escapeHTML: text => String(text),
  saveStory: () => { saves++; return true; },
  async buildMessages() {
    return [{ role: "system", content: "PLATFORM STABLE PREFIX" }, { role: "user", content: "我到中央商業區了" }];
  },
  wrapBuildMessages(id, wrapper) {
    assert.equal(id, "worldbook-library:recall");
    const base = this.buildMessages.bind(this);
    this.buildMessages = (...args) => wrapper(base, ...args);
  }
};
const doc = {
  head: { appendChild() {} }, body: {},
  createElement: () => ({ textContent: "" }),
  querySelector: () => null
};
const win = { YoruWorldbookLibraryCore: core, App, GameState, Chat };
const context = {
  window: win, document: doc, App, GameState, Chat,
  MutationObserver: class { observe() {} },
  fetch: async url => {
    assert.ok(["data/worldbook-library.json", "data/sunrise-worldbook-library.json", "data/world-simulator-general-library.json", "data/astral-worldbook-library.json"].includes(url));
    if (url === "data/astral-worldbook-library.json") return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, "../data/astral-worldbook-library.json"), "utf8")) };
    if (url === "data/world-simulator-general-library.json") return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, "../data/world-simulator-general-library.json"), "utf8")) };
    if (url === "data/sunrise-worldbook-library.json") return { ok: true, json: async () => ({ packs: [] }) };
    calls++;
    return { ok: true, json: async () => catalog };
  },
  console
};
const source = fs.readFileSync(path.join(__dirname, "../js/worldbook-library.js"), "utf8");
vm.runInNewContext(source, context, { filename: "worldbook-library.js" });

(async () => {
  const first = await App.buildMessages();
  assert.equal(first[0].content, "PLATFORM STABLE PREFIX");
  assert.match(first[1].content, /世界書按需提供的背景資料/);
  assert.match(first[1].content, /中央商業區/);
  assert.equal(calls, 1);
  assert.equal(saves, 0);
  const second = await App.buildMessages();
  const modes = win.YoruWorldbookLibrary;
  const listed = await modes.all();
  const simulatorGroup = modes.groupPacks(listed).filter(g=>g.name==='通用世界模擬器');
  assert.equal(simulatorGroup.length,1,'new entries stay inside one player-facing book');
  assert.equal(simulatorGroup[0].packs.length,6,'this batch adds no category');
  assert.equal(simulatorGroup[0].packs.reduce((sum,p)=>sum+p.entries.length,0),62);
  assert.ok(listed.some(p => p.meta.id === "world-simulator-adventure-reference"), "public shared catalog is discoverable");
  assert.equal(modes.setRecallMode("off"), true);
  const off = await App.buildMessages();
  assert.equal(off[0].content, "PLATFORM STABLE PREFIX");
  assert.doesNotMatch(off[1].content, /中央商業區位於曙光市中心/);
  assert.match(off[1].content, /曙光市是東部沿海/);
  assert.equal(modes.setRecallMode("invalid"), false);
  assert.equal(modes.setRecallMode("scene"), true);
  assert.match((await App.buildMessages())[1].content, /中央商業區位於曙光市中心/);
  assert.equal(modes.setRecallMode("auto"), true);
  assert.equal(calls, 1, "static catalog should be cached");
  assert.equal((second[1].content.match(/世界書資料結束/g) || []).length, 1);
  GameState.current.worldbookLibrary.enabled = [];
  const disabled = await App.buildMessages();
  assert.equal(disabled[1].content, "我到中央商業區了", "opt-out must leave prompt byte-for-byte unchanged");
  GameState.current.worldbookLibrary.enabled = ["sunrise-geography-demo"];
  GameState.current.location = "陌生地點";
  Chat.messages = [{ role: "user", content: "你好" }];
  // Foundation is allowed only after explicit opt-in, but irrelevant details are still suppressed.
  const generic = await App.buildMessages();
  assert.match(generic[1].content, /曙光市是東部沿海/);
  assert.doesNotMatch(generic[1].content, /中央商業區位於曙光市中心/);
  const gated = core.normalizePack({schema:core.SCHEMA,version:1,
    meta:{id:"private-case",name:"私人案件",world:"general"}, entries:[
      {id:"evidence",mode:"keyword",keywords:["證據"],requires:["found","verified"],content:"已確認的證據"},
      {id:"review",mode:"keyword",keywords:["證據"],requires:["unsafe"],review_required:true,content:"待審規則"}
    ]});
  GameState.current.worldbookLibrary.installed = [gated];
  GameState.current.worldbookLibrary.enabled = ["private-case"];
  Chat.messages = [{role:"user",content:"證據"}];
  const api = win.YoruWorldbookLibrary;
  assert.doesNotMatch((await App.buildMessages())[1].content, /已確認的證據/);
  assert.equal(await api.setCondition("private-case", "found", true), true);
  assert.doesNotMatch((await App.buildMessages())[1].content, /已確認的證據/);
  assert.equal(await api.setCondition("private-case", "verified", true), true);
  assert.match((await App.buildMessages())[1].content, /已確認的證據/);
  assert.equal(await api.setCondition("private-case", "unsafe", true), false);
  assert.equal(await api.setCondition("private-case", "invented", true), false);
  assert.equal(await api.setCondition("private-case", "found", false), true);
  assert.doesNotMatch((await App.buildMessages())[1].content, /已確認的證據/);
  const restored = JSON.parse(JSON.stringify(GameState.current));
  assert.deepEqual(restored.worldbookFlags, ["verified"]);
  const old = GameState.current;
  GameState.current = restored;
  assert.equal(await api.setCondition("private-case", "found", true, old), false);
  const inFlight = api.setCondition("private-case", "found", true);
  GameState.current = old;
  assert.equal(await inFlight, false, "async operation must not write after story changes");
  old.worldbookLibrary.enabled = [];
  assert.equal(await api.setCondition("private-case", "found", true), false);
  assert.equal(saves, 6);
  const relationshipId = 'world-simulator-relationship-reference';
  assert.ok(listed.some(p => p.meta.id === relationshipId));
  GameState.current = {location:'', npcs:[], events:[], worldbookLibrary:{version:1,
    enabled:[relationshipId], installed:[], pinned:{}, recallMode:'auto'}};
  Chat.messages = [{role:'user', content:'我想找競爭對手談談'}];
  const withRelationship = await App.buildMessages();
  assert.match(withRelationship.at(-1).content, /有底線的競爭對手參考/);
  assert.equal(withRelationship[0].content, 'PLATFORM STABLE PREFIX');
  for (const mode of ['scene', 'off']) {
    GameState.current.worldbookLibrary.recallMode = mode;
    const result = await App.buildMessages();
    assert.equal(result[0].content, withRelationship[0].content);
    assert.doesNotMatch(result.at(-1).content, /有底線的競爭對手參考/);
  }
  GameState.current.worldbookLibrary.recallMode = 'auto';
  GameState.current.worldbookLibrary.enabled = [];
  assert.doesNotMatch((await App.buildMessages()).at(-1).content, /有底線的競爭對手參考/);
  for (const [packId, query, title] of [
    ['world-simulator-romance-reference', '純愛劇本', '純愛與初戀題材參考'],
    ['world-simulator-intrigue-reference', '真假千金', '真假身分與雙重生活題材參考'],
    ['world-simulator-growth-reference', '校園祭', '校園日常題材參考'],
    ['world-simulator-relationship-reference','女裝角色','性別表達與認同參考'],
    ['world-simulator-romance-reference','ABO劇本','ABO 關係與社會張力參考'],
    ['world-simulator-romance-reference','伴侶背叛','承諾與背叛衝突參考'],
    ['world-simulator-relationship-reference','不安依附','不安依附與關係衝突參考']
  ]) {
    assert.ok(listed.some(p=>p.meta.id===packId));
    GameState.current.worldbookLibrary.enabled = [packId];
    Chat.messages = [{role:'user',content:query}];
    for (const mode of ['auto','scene','off']) {
      GameState.current.worldbookLibrary.recallMode=mode;
      const result=await App.buildMessages();
      assert.equal(result[0].content,'PLATFORM STABLE PREFIX');
      if(mode==='auto') assert.match(result.at(-1).content,new RegExp(title));
      else assert.doesNotMatch(result.at(-1).content,new RegExp(title));
    }
  }
  const romanceId='world-simulator-romance-reference';
  const historicalRomance=JSON.parse(JSON.stringify(listed.find(p=>p.meta.id===romanceId)));
  historicalRomance.entries=historicalRomance.entries.slice(0,9);
  historicalRomance.meta.release='0.1.0';
  GameState.current.worldbookLibrary={version:1,enabled:[romanceId],installed:[],pinned:{[romanceId]:historicalRomance},recallMode:'auto'};
  assert.equal((await modes.all()).find(p=>p.meta.id===romanceId).entries.length,9);
  Chat.messages=[{role:'user',content:'ABO劇本'}];
  const oldRomancePrompt=await App.buildMessages();
  assert.doesNotMatch(oldRomancePrompt.at(-1).content,/ABO 關係與社會張力參考/);
  assert.equal(oldRomancePrompt[0].content,'PLATFORM STABLE PREFIX');
  const oldRomanceV2=JSON.parse(JSON.stringify(listed.find(p=>p.meta.id===romanceId)));
  oldRomanceV2.entries=oldRomanceV2.entries.slice(0,11);
  oldRomanceV2.meta.release='0.2.0';
  GameState.current.worldbookLibrary.pinned[romanceId]=oldRomanceV2;
  assert.equal((await modes.all()).find(p=>p.meta.id===romanceId).entries.length,11);
  Chat.messages=[{role:'user',content:'伴侶背叛'}];
  assert.doesNotMatch((await App.buildMessages()).at(-1).content,/承諾與背叛衝突參考/);
  const lifeId='world-simulator-life-reference';
  const historicalLife=JSON.parse(JSON.stringify(listed.find(p=>p.meta.id===lifeId)));
  historicalLife.entries=historicalLife.entries.slice(0,2);
  historicalLife.meta.release='0.1.0';
  GameState.current.worldbookLibrary={version:1,enabled:[lifeId],installed:[],pinned:{[lifeId]:historicalLife},recallMode:'auto'};
  assert.equal((await modes.all()).find(p=>p.meta.id===lifeId).entries.length,2);
  Chat.messages=[{role:'user',content:'職涯委託'}];
  const oldLifePrompt=await App.buildMessages();
  assert.doesNotMatch(oldLifePrompt.at(-1).content,/職涯委託參考/);
  assert.equal(oldLifePrompt[0].content,'PLATFORM STABLE PREFIX');
  const adventureId='world-simulator-adventure-reference';
  const historicalAdventure=JSON.parse(JSON.stringify(listed.find(p=>p.meta.id===adventureId)));
  historicalAdventure.entries=historicalAdventure.entries.slice(0,4);
  historicalAdventure.meta.release='0.1.0';
  GameState.current.worldbookLibrary={version:1,enabled:[adventureId],installed:[],pinned:{[adventureId]:historicalAdventure},recallMode:'auto'};
  assert.equal((await modes.all()).find(p=>p.meta.id===adventureId).entries.length,4);
  Chat.messages=[{role:'user',content:'公會委託'}];
  assert.doesNotMatch((await App.buildMessages()).at(-1).content,/公會委託參考/);
  assert.equal((await App.buildMessages())[0].content,'PLATFORM STABLE PREFIX');
  const historical = JSON.parse(JSON.stringify(listed.find(p=>p.meta.id===relationshipId)));
  historical.entries = historical.entries.slice(0,8);
  historical.meta.release = '0.1.0';
  GameState.current.worldbookLibrary = {version:1, enabled:[relationshipId], installed:[],
    pinned:{[relationshipId]:historical}, recallMode:'auto'};
  const pinned = (await modes.all()).find(p=>p.meta.id===relationshipId);
  assert.equal(pinned.entries.length,8,'existing story snapshot does not silently acquire new traits');
  Chat.messages = [{role:'user',content:'腹黑好友'}];
  const historicalPrompt = await App.buildMessages();
  assert.doesNotMatch(historicalPrompt.at(-1).content,/腹黑好友互動參考/);
  assert.equal(historicalPrompt[0].content,'PLATFORM STABLE PREFIX');
  for(const size of [8,13,21,26,27]) {
    const oldPack=JSON.parse(JSON.stringify(listed.find(p=>p.meta.id===relationshipId)));
    oldPack.entries=oldPack.entries.slice(0,size);
    oldPack.meta.release=({8:'0.1.0',13:'0.2.0',21:'0.3.0',26:'0.4.0',27:'0.5.0'})[size];
    GameState.current.worldbookLibrary.pinned[relationshipId]=oldPack;
    assert.equal((await modes.all()).find(p=>p.meta.id===relationshipId).entries.length,size);
    Chat.messages=[{role:'user',content:'甜美偶像'}];
    const older=await App.buildMessages();
    if(size<26) assert.doesNotMatch(older.at(-1).content,/認真表演者互動參考/);
    Chat.messages=[{role:'user',content:'女裝角色'}];
    if(size<27) assert.doesNotMatch((await App.buildMessages()).at(-1).content,/性別表達與認同參考/);
    Chat.messages=[{role:'user',content:'不安依附'}];
    assert.doesNotMatch((await App.buildMessages()).at(-1).content,/不安依附與關係衝突參考/);
    assert.equal(older[0].content,'PLATFORM STABLE PREFIX');
  }
  const astral = listed.filter(p=>p.meta.world==='astral-continent');
  assert.equal(astral.length,4);
  assert.equal(modes.groupPacks(astral).length,1,'dedicated chapters appear as one selectable book');
  GameState.current = {location:'永夜領',npcs:[],events:[],worldbookLibrary:{version:1,
    enabled:astral.map(p=>p.meta.id),installed:[],pinned:{},recallMode:'auto'}};
  Chat.messages=[{role:'user',content:'我想了解加雷斯·聖裁。'}];
  const introduction=await App.buildMessages();
  assert.equal(introduction[0].content,'PLATFORM STABLE PREFIX');
  assert.match(introduction.at(-1).content,/聖裁勇者/);
  assert.doesNotMatch(introduction.at(-1).content,/神化容器/);
  assert.equal(await modes.setCondition('astral-world-characters','已確認加雷斯的內情',true),true);
  const revealed=await App.buildMessages();
  assert.equal(revealed[0].content,introduction[0].content);
  assert.match(revealed.at(-1).content,/神化容器/);
  assert.doesNotMatch(revealed.at(-1).content,/曙光市中心/);
  console.log("Worldbook prompt integration passed: cache-friendly stable prefix, selection, no double append, opt-out, conditional recall and dedicated original-text lore.");
})().catch(err => { console.error(err); process.exitCode = 1; });
