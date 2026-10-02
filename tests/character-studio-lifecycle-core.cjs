const assert = require("node:assert/strict");
const core = require("../js/character-studio-lifecycle-core.js");

assert.equal(core.sameVersion(
  { b: 2, a: 1, source: "local-import" },
  { a: 1, b: 2, source: "custom" }
), true);

assert.equal(core.sameVersion(
  { a: 1, nested: { b: 2 } },
  { a: 1, nested: { b: 3 } }
), false);

assert.deepEqual(core.draftCardBadges({ installed: false, publicKnown: true, published: false }), [
  { key: "draft", label: "草稿", tone: "muted" }
]);
assert.deepEqual(core.draftCardBadges({ installed: true, synced: false, publicKnown: true, published: true }), [
  { key: "draft", label: "草稿", tone: "muted" },
  { key: "local-outdated", label: "本機待更新", tone: "warn" },
  { key: "published", label: "已公開", tone: "good" }
]);
assert.equal(core.draftCardBadges({ installed: true, synced: true })[1].label, "本機已同步");
assert.equal(core.draftCardBadges({ archived: true })[0].label, "已封存");

{
  const state = core.derive({
    hasDraft: false,
    dirty: true,
    installed: false,
    synced: false,
    audit: { errors: [], ready: false, longFormReady: false },
    publicKnown: true,
    published: false
  });
  assert.equal(state.draft.label, "尚未儲存修改");
  assert.equal(state.test.label, "尚未加入我的角色");
  assert.equal(state.publication.label, "尚未上架");
  assert.equal(state.next.action, "save");
}

{
  const state = core.derive({
    hasDraft: true,
    dirty: false,
    installed: true,
    synced: false,
    audit: { errors: [], ready: true, longFormReady: false },
    publicKnown: true,
    published: false
  });
  assert.equal(state.test.label, "本機試玩版本較舊");
  assert.equal(state.next.action, "install");
}

{
  const state = core.derive({
    hasDraft: true,
    dirty: false,
    installed: true,
    synced: true,
    audit: { errors: [], ready: true, longFormReady: true },
    publicKnown: true,
    published: false
  });
  assert.equal(state.readiness.label, "長篇測試就緒");
  assert.equal(state.next.action, "export");
  assert.match(state.next.detail, /管理員審核/);
}

{
  const state = core.derive({
    hasDraft: true,
    dirty: false,
    installed: true,
    synced: true,
    audit: { errors: [], ready: true, longFormReady: true },
    publicKnown: true,
    published: true
  });
  assert.equal(state.publication.label, "已在公開作品庫");
  assert.equal(state.next.action, "published");
  assert.match(state.next.detail, /更新／下架流程/);
}

{
  const state = core.derive({
    hasDraft: true,
    dirty: false,
    installed: true,
    synced: true,
    audit: { errors: [], ready: true },
    publicKnown: false
  });
  assert.equal(state.publication.label, "公開狀態暫時無法確認");
}

console.log("character studio lifecycle core test passed");
