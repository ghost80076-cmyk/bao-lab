const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const world = fs.readFileSync(path.join(root, "js/world-modules.js"), "utf8");
const story = fs.readFileSync(path.join(root, "js/story-tools.js"), "utf8");

assert.match(
  world,
  /if \(window\.BAOWorldModules \|\| typeof GameState === "undefined" \|\| typeof WorldStateEngine === "undefined"\) return;/,
  "world-modules must refuse duplicate installation"
);
assert.match(
  world,
  /window\.BAOWorldModules\s*=\s*\{/,
  "world-modules must publish its installed marker"
);

assert.match(
  story,
  /if \(window\.BAOStoryTools \|\| typeof App === "undefined" \|\| typeof Chat === "undefined" \|\| typeof Storage === "undefined"\) return;/,
  "story-tools must refuse duplicate installation"
);
assert.match(
  story,
  /window\.BAOStoryTools\s*=\s*\{/,
  "story-tools must publish its installed marker"
);

console.log("frontend-idempotency-core: extension wrappers install once");
