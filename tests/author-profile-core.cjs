const assert = require("node:assert/strict");
const core = require("../js/author-profile-core.js");

assert.equal(core.validAuthorId("baitao"), true);
assert.equal(core.validAuthorId("a"), false);
assert.equal(core.validAuthorId("Bad Author"), false);

assert.deepEqual(
  core.safeSupportLink({ label: "替作者留一盞燈", url: "https://example.com/support" }),
  { label: "替作者留一盞燈", url: "https://example.com/support" }
);
assert.equal(core.safeSupportLink({ url: "http://example.com" }), null);
assert.equal(core.safeSupportLink({ url: "https://user:pass@example.com" }), null);

const registry = core.normalizeRegistry({
  authors: [
    {
      id: "baitao",
      name: "白桃",
      bio: "寫故事的人",
      support_links: [
        { label: "支持作者", url: "https://example.com/baitao" },
        { label: "Ko-fi", url: "https://example.com/kofi" },
        { label: "街口支持", url: "https://example.com/jkopay" },
        { label: "第四個", url: "https://example.com/four" },
        { label: "第五個", url: "https://example.com/five" },
        { label: "第六個會被截掉", url: "https://example.com/six" },
        { label: "不安全", url: "javascript:alert(1)" }
      ]
    },
    { id: "baitao", name: "重複作者" },
    { id: "Bad Author", name: "無效" }
  ]
});
assert.equal(registry.authors.length, 1);
assert.equal(registry.authors[0].name, "白桃");
assert.equal(registry.authors[0].support_links.length, 5);
assert.equal(registry.authors[0].support_links[4].label, "第五個");

const works = core.worksForAuthor([
  {
    id: "old",
    author_id: "baitao",
    updated_at: "2026-09-01T00:00:00Z",
    published_version: 1
  },
  {
    id: "new",
    author_id: "baitao",
    version_published_at: "2026-10-01T00:00:00Z",
    published_version: 2
  },
  {
    id: "other",
    author_id: "someone-else"
  }
], "baitao");
assert.deepEqual(works.map(item => item.id), ["new", "old"]);
assert.match(core.publicationLabel(works[0]), /^v2/);

console.log("author profile core test passed");
