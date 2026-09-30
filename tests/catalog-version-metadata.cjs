const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const catalog = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../data/characters.json"),
  "utf8"
));

assert.ok(Array.isArray(catalog) && catalog.length > 0);

for (const entry of catalog) {
  assert.ok(entry.id, "catalog entry must have a stable id");
  assert.ok(Number.isInteger(entry.published_version) && entry.published_version > 0,
    entry.id + " must have a positive published_version");

  const publishedAt = Date.parse(entry.published_at);
  const updatedAt = Date.parse(entry.updated_at);
  const versionPublishedAt = Date.parse(entry.version_published_at);

  assert.ok(Number.isFinite(publishedAt), entry.id + " published_at must be valid");
  assert.ok(Number.isFinite(updatedAt), entry.id + " updated_at must be valid");
  assert.ok(Number.isFinite(versionPublishedAt), entry.id + " version_published_at must be valid");
  assert.ok(versionPublishedAt >= publishedAt,
    entry.id + " version_published_at cannot be before first publication");
  assert.ok(updatedAt >= versionPublishedAt,
    entry.id + " updated_at cannot be before the current version release");
}

console.log("official catalog version metadata test passed");
