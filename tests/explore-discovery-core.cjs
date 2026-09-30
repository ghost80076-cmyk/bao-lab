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
  { id: "room", viewedAt: 300, seenUpdatedAt: 0, seenVersion: 0 },
  { id: "city", viewedAt: 200, seenUpdatedAt: 0, seenVersion: 0 }
]);
assert.deepEqual(core.libraryMeta(library, "room"), { favorite: true, recentAt: 300, seenUpdatedAt: 0, seenVersion: 0 });
assert.deepEqual(core.libraryMeta(library, "adult"), { favorite: false, recentAt: 0, seenUpdatedAt: 0, seenVersion: 0 });

const toggled = core.toggleFavorite(library, "city");
assert.deepEqual(toggled.favorites, ["city", "room"]);
assert.deepEqual(core.toggleFavorite(toggled, "room").favorites, ["city"]);

const viewed = core.markViewed(library, "city", 500, "2026-09-28T00:00:00Z", 3);
assert.deepEqual(viewed.recent[0], {
  id: "city",
  viewedAt: 500,
  seenUpdatedAt: Date.parse("2026-09-28T00:00:00Z"),
  seenVersion: 3
});

const extraFromLibrary = item => core.libraryMeta(library, item.id);
assert.deepEqual(core.filter(works, { category: "all", scope: "favorites" }, extraFromLibrary).map(x => x.id), ["room"]);
assert.deepEqual(core.filter(works, { category: "all", scope: "recent" }, extraFromLibrary).map(x => x.id), ["room", "city"]);


const now = Date.parse("2026-09-30T12:00:00Z");
const newEntry = {
  published_at: "2026-09-28T10:00:00Z",
  updated_at: "2026-09-28T10:00:00Z"
};
const updatedEntry = {
  published_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-09-29T10:00:00Z"
};
const oldEntry = {
  published_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-02T10:00:00Z"
};

assert.equal(core.workUpdateState(newEntry, { recentAt: 0, seenUpdatedAt: 0 }, now).badge, "NEW");
assert.equal(core.workUpdateState(updatedEntry, { recentAt: 0, seenUpdatedAt: 0 }, now).badge, "NEW");
assert.equal(
  core.workUpdateState(updatedEntry, {
    recentAt: now - 1000,
    seenUpdatedAt: Date.parse("2026-09-28T10:00:00Z")
  }, now).badge,
  "UPDATED"
);
assert.equal(
  core.workUpdateState(updatedEntry, {
    recentAt: now - 1000,
    seenUpdatedAt: Date.parse("2026-09-29T10:00:00Z")
  }, now).badge,
  ""
);
assert.equal(core.workUpdateState(oldEntry, { recentAt: 0, seenUpdatedAt: 0 }, now).recentUpdate, false);

const version2 = {
  published_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-09-30T09:00:00Z",
  published_version: 2,
  version_published_at: "2026-09-30T08:00:00Z"
};
assert.equal(core.publicationMeta(version2).publishedVersion, 2);
assert.equal(core.publicationMeta(version2).activityAt, Date.parse("2026-09-30T08:00:00Z"));
assert.equal(
  core.workUpdateState(version2, { recentAt: 0, seenUpdatedAt: 0, seenVersion: 0 }, now).badge,
  "NEW",
  "a current version is NEW to a player who has never viewed the work"
);
assert.equal(
  core.workUpdateState(version2, {
    recentAt: Date.parse("2026-07-20T00:00:00Z"),
    seenUpdatedAt: Date.parse("2026-07-20T00:00:00Z"),
    seenVersion: 1
  }, Date.parse("2027-01-01T00:00:00Z")).badge,
  "UPDATED",
  "a missed explicit version stays UPDATED until the player sees it, even after the freshness window"
);
assert.equal(
  core.workUpdateState(version2, {
    recentAt: now - 1000,
    seenUpdatedAt: Date.parse("2026-09-30T08:00:00Z"),
    seenVersion: 2
  }, now).badge,
  ""
);
assert.equal(
  core.workUpdateState(version2, {
    recentAt: now - 1000,
    seenUpdatedAt: Date.parse("2026-09-30T08:00:00Z"),
    seenVersion: 0
  }, now).badge,
  "",
  "legacy timestamp continuity migrates to the current version when it proves the player saw that release"
);

const metadataOnlyEdit = {
  ...version2,
  updated_at: "2026-09-30T11:59:00Z",
  version_published_at: "2026-07-15T00:00:00Z"
};
assert.equal(
  core.workUpdateState(metadataOnlyEdit, {
    recentAt: now - 1000,
    seenUpdatedAt: Date.parse("2026-07-15T00:00:00Z"),
    seenVersion: 2
  }, now).recentUpdate,
  false,
  "catalog metadata edits do not become player-facing recent updates without a version release"
);

const updateWorks = [
  {
    ...works[0],
    published_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-30T11:00:00Z",
    published_version: 2,
    version_published_at: "2026-09-29T00:00:00Z"
  },
  {
    ...works[1],
    published_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-30T11:30:00Z",
    published_version: 4,
    version_published_at: "2026-09-25T00:00:00Z"
  }
];
const updateExtra = item => {
  const status = core.workUpdateState(item, { recentAt: 0, seenUpdatedAt: 0 }, now);
  return { ...status };
};
assert.deepEqual(
  core.filter(updateWorks, { category: "all", scope: "updates" }, updateExtra).map(x => x.id),
  ["city", "room"]
);

assert.deepEqual(core.capabilityLabels(works[0]), ["世界模擬"]);
assert.deepEqual(core.capabilityLabels(works[1]), ["互動 UI"]);
assert.equal(core.resultLabel(3, false), "目前顯示 3 個作品");
assert.match(core.resultLabel(3, true), /載入更多後搜尋範圍會擴大/);

console.log("explore discovery core test passed");
