const assert = require("node:assert/strict");
const core = require("../js/explore-discovery-core.js");

const works = [
  {
    id: "city",
    title: "雨港夜行",
    name: "雨港",
    category: "male",
    rating: "general",
    description: "一座持續運作的港口城市。",
    tags: ["世界模擬", "長篇故事"],
    supported_modes: { immersive: true, world: true },
    supported_display: { text: true, ui: false }
  },
  {
    id: "room",
    title: "深夜房間",
    name: "房間",
    category: "female",
    rating: "general",
    description: "單角色關係故事。",
    tags: ["慢熱"],
    supported_modes: { immersive: true, world: false },
    supported_display: { text: true, ui: true }
  },
  {
    id: "adult",
    title: "成人作品",
    category: "r18",
    rating: "adult",
    tags: ["R18"],
    supported_modes: { immersive: true, world: true },
    supported_display: { text: true, ui: true }
  }
];

assert.deepEqual(core.filter(works, { category: "all" }).map(x => x.id), ["city", "room"]);
assert.deepEqual(core.filter(works, { category: "r18" }).map(x => x.id), ["adult"]);
assert.deepEqual(core.filter(works, { category: "all", capability: "world" }).map(x => x.id), ["city"]);
assert.deepEqual(core.filter(works, { category: "all", capability: "ui" }).map(x => x.id), ["room"]);
assert.deepEqual(core.filter(works, { category: "all", query: "長篇" }).map(x => x.id), ["city"]);
assert.deepEqual(core.filter(works, { category: "all", query: "作者甲" }, () => ({ author: "作者甲" })).map(x => x.id), ["city", "room"]);


const library = core.normalizeLibrary({
  favorites: ["room", "room", ""],
  recent: [
    { id: "city", viewedAt: 100 },
    { id: "room", viewedAt: 300 },
    { id: "city", viewedAt: 200 }
  ]
});
assert.deepEqual(library.favorites, ["room"]);
assert.deepEqual(library.recent, [
  { id: "room", viewedAt: 300 },
  { id: "city", viewedAt: 200 }
]);
assert.deepEqual(core.libraryMeta(library, "room"), { favorite: true, recentAt: 300 });
assert.deepEqual(core.libraryMeta(library, "adult"), { favorite: false, recentAt: 0 });

const toggled = core.toggleFavorite(library, "city");
assert.deepEqual(toggled.favorites, ["city", "room"]);
assert.deepEqual(core.toggleFavorite(toggled, "room").favorites, ["city"]);

const viewed = core.markViewed(library, "city", 500);
assert.deepEqual(viewed.recent[0], { id: "city", viewedAt: 500 });

const extraFromLibrary = item => core.libraryMeta(library, item.id);
assert.deepEqual(core.filter(works, { category: "all", scope: "favorites" }, extraFromLibrary).map(x => x.id), ["room"]);
assert.deepEqual(core.filter(works, { category: "all", scope: "recent" }, extraFromLibrary).map(x => x.id), ["room", "city"]);

assert.deepEqual(core.capabilityLabels(works[0]), ["世界模擬"]);
assert.deepEqual(core.capabilityLabels(works[1]), ["互動 UI"]);
assert.equal(core.resultLabel(3, false), "目前顯示 3 個作品");
assert.match(core.resultLabel(3, true), /載入更多後搜尋範圍會擴大/);

console.log("explore discovery core test passed");
