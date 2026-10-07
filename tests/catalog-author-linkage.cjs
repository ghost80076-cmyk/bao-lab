const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const registry = readJson("data/authors.json");
const authorIds = new Set((registry.authors || []).map(author => String(author.id || "").trim().toLowerCase()));
assert.ok(authorIds.size > 0, "public author registry must not be empty");

const official = readJson("data/characters.json");
const manifest = readJson("data/character-catalog/community/manifest.json");
const community = [];
for (const page of (manifest.pages || [])) {
  if (!page?.file) continue;
  const entries = readJson(String(page.file));
  if (Array.isArray(entries)) community.push(...entries);
}

const catalogEntries = [...official, ...community];
assert.ok(catalogEntries.length > 0, "public catalog must not be empty");

for (const entry of catalogEntries) {
  const id = String(entry.id || "").trim();
  const authorId = String(entry.author_id || "").trim().toLowerCase();
  const author = String(entry.author || "").trim();

  assert.ok(id, "catalog entry must have a stable id");
  assert.match(authorId, /^[a-z0-9][a-z0-9_-]{1,63}$/, id + " must expose a valid author_id");
  assert.ok(authorIds.has(authorId), id + " author_id must exist in data/authors.json");
  assert.ok(author, id + " must expose a public author display name");
}

const uniqueWorks = new Set(catalogEntries.map(entry => String(entry.id || "").trim()).filter(Boolean));
assert.ok(uniqueWorks.size > 0, "public works must have stable ids");

const index = read("index.html");
assert.match(index, /href="author\.html">作者<\/a>/, "main navigation must expose the public author directory");
assert.match(index, /id="builder-author-link"/, "story setup must expose a public author link");

const authorPage = read("author.html");
assert.match(authorPage, /href="author\.html">所有作者<\/a>/, "author page must link back to the public directory");

const authorProfile = read("js/author-profile.js");
assert.match(authorProfile, /function renderDirectory\(/, "author profile route must render the directory without an id");
assert.match(authorProfile, /查看作者與作品/, "directory cards must link to each public author");

const characterUi = read("js/character-ui.js");
assert.match(characterUi, /builder-author-link/, "story setup must populate the author link");
assert.match(characterUi, /author\.html\?id=/, "story setup author link must target the public profile");

const exploreDiscovery = read("js/explore-discovery.js");
assert.match(exploreDiscovery, /data-explore-preview-author/, "work preview must keep the author visible");
assert.doesNotMatch(exploreDiscovery, /data-explore-view=/, "catalog cards must not duplicate the existing work preview with a second detail mode");
assert.doesNotMatch(exploreDiscovery, /explore-card-author/, "catalog cards must keep author metadata inside the work preview instead of the poster");

const exploreCss = read("css/explore-discovery.css");
assert.match(
  exploreCss,
  /\.character-card \.explore-card-capabilities\{display:none!important\}/,
  "catalog posters must keep capability labels out of the cover layer"
);

console.log("public author discovery linkage test passed");
