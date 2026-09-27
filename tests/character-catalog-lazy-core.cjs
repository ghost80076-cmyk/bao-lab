const assert = require("node:assert/strict");
const fs = require("node:fs");

const catalog = JSON.parse(fs.readFileSync("data/characters.json", "utf8"));
assert.ok(Array.isArray(catalog) && catalog.length > 0, "character catalog must not be empty");

for (const item of catalog) {
  assert.ok(item.id, "catalog entry needs id");
  assert.ok(item.file, `${item.id}: catalog entry needs file`);
  assert.ok(item.name, `${item.id}: catalog entry needs name`);
  assert.ok(item.avatar, `${item.id}: catalog entry needs avatar`);
  assert.ok(["male", "female", "r18"].includes(item.category), `${item.id}: catalog category must already be normalized`);
  assert.equal(typeof item.description, "string", `${item.id}: catalog needs description`);
  assert.equal(typeof item.supported_modes, "object", `${item.id}: catalog needs supported_modes`);
  assert.equal(typeof item.supported_display, "object", `${item.id}: catalog needs supported_display`);

  const full = JSON.parse(fs.readFileSync(item.file, "utf8"));
  const fullId = String(full?.meta?.id || full?.id || "");
  assert.equal(fullId, item.id, `${item.id}: catalog id must match full character file`);
}

const app = fs.readFileSync("js/app.js", "utf8");
const ui = fs.readFileSync("js/character-ui.js", "utf8");
const storage = fs.readFileSync("js/storage.js", "utf8");

assert.match(app, /async loadCharacter\(id\)/, "App must lazy-load a full character on demand");
assert.match(app, /catalog_only/, "catalog entries must stay distinguishable from full character data");
assert.doesNotMatch(ui, /Promise\.all\(manifest\.map/, "character UI must not eagerly fetch every full card");
assert.match(storage, /character\.catalog_only/, "story restore must not accept an unresolved catalog placeholder");

console.log(`character catalog lazy-load regression: ${catalog.length} built-in entries verified`);
