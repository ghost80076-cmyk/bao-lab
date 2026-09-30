const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workerSource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

const instrumented =
  workerSource.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { prepareCharacterPublication, githubSettings };";

const {
  prepareCharacterPublication,
  githubSettings,
} = new Function(instrumented)();

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=";

const prepared = prepareCharacterPublication({
  rights_confirmed: true,
  author_name: "Test Author",
  source_format: "SillyTavern Character Card V2",
  cover_data_url: onePixelPng,
  card: {
    schema_version: "1.5",
    meta: {
      id: "community-test",
      name: "Community Test",
      title: "Community Test",
      avatar: "https://example.com/raw.png",
      category: "female",
      tags: ["slow burn", "test"],
      description: "test",
      gender: "male",
    },
    content: {
      greeting: "hello",
      system_prompt: "stay in character",
      extra: {
        api_key: "must-not-publish",
      },
    },
    gameplay: {
      supported_modes: {
        immersive: true,
        world: false,
      },
      future_mod_config: {
        enabled: true,
        mode: "display-only",
      },
    },
    presentation: {
      supported_display: {
        text: true,
        ui: false,
      },
      future_regex_mod: {
        version: 1,
        preserved_source: {
          raw: "must-not-publish",
        },
        rules: [
          {
            pattern: "NPC:",
            replacement: "角色：",
          },
        ],
      },
    },
    import_metadata: {
      source_format: "sillytavern-v2",
      preserved_source: {
        private_payload: "must-not-publish",
      },
      unmapped_fields: ["future_field"],
    },
  },
});

assert.equal(prepared.id, "community-test");
assert.equal(prepared.card.meta.creator, "Test Author");
assert.equal(prepared.bucket, "28");
assert.equal(prepared.card.meta.avatar, "assets/community/28/community-test.png");
assert.equal(prepared.catalogEntry.avatar, "assets/community/28/community-test.png");
assert.equal(prepared.catalogEntry.file, "data/characters/community/28/community-test.json");
assert.equal(prepared.cover.path, "assets/community/28/community-test.png");
assert.equal(prepared.card.content.extra.api_key, "[REDACTED]");
assert.equal(prepared.card.gameplay.future_mod_config.mode, "display-only");
assert.deepEqual(prepared.card.presentation.future_regex_mod.rules, [
  {
    pattern: "NPC:",
    replacement: "角色：",
  },
]);
assert.equal(
  "preserved_source" in prepared.card.presentation.future_regex_mod,
  false
);
assert.equal("preserved_source" in prepared.card.import_metadata, false);
assert.deepEqual(prepared.card.import_metadata.unmapped_fields, ["future_field"]);
assert.equal(prepared.catalogEntry.author, "Test Author");
assert.ok(Number.isFinite(Date.parse(prepared.catalogEntry.published_at)));
assert.equal(prepared.catalogEntry.updated_at, prepared.catalogEntry.published_at);

assert.throws(
  () => prepareCharacterPublication({
    rights_confirmed: false,
    card: {},
  }),
  /rights_confirmation_required/
);

assert.throws(
  () => prepareCharacterPublication({
    rights_confirmed: true,
    cover_data_url: "data:image/png;base64,YWJj",
    card: {
      meta: {
        id: "bad-image",
        name: "Bad",
        category: "male",
      },
      content: {
        greeting: "hello",
        system_prompt: "prompt",
      },
    },
  }),
  /invalid_cover_image/
);

assert.equal(
  githubSettings({
    GITHUB_TOKEN: "token",
  }).configured,
  true
);

assert.equal(
  githubSettings({}).configured,
  false
);

assert.match(
  workerSource,
  /\/admin\/characters\/publish-pr/
);

assert.match(
  workerSource,
  /"\/pulls"/
);

assert.match(
  workerSource,
  /COMMUNITY_CATALOG_PAGE_SIZE\s*=\s*48/
);

assert.match(
  workerSource,
  /data\/character-catalog\/community\/manifest\.json/
);

assert.match(
  workerSource,
  /page-[\s\S]*padStart/
);

assert.doesNotMatch(
  workerSource,
  /preserved_source\s*:\s*sourceMetadata\.preserved_source/
);

const uiSource = fs.readFileSync(
  path.join(__dirname, "../js/admin-character-publish.js"),
  "utf8"
);

const adminHtml = fs.readFileSync(
  path.join(__dirname, "../admin-wallet.html"),
  "utf8"
);

assert.match(
  uiSource,
  /YoruBayAdmin\.api\("\/admin\/characters\/publish-pr"/
);

assert.doesNotMatch(
  uiSource,
  /api\.github\.com|GITHUB_TOKEN/
);

assert.match(
  uiSource,
  /sourceCard/
);

assert.match(
  uiSource,
  /publicSafeSection/
);

assert.match(
  adminHtml,
  /id="publish-character-file"/
);

assert.match(
  adminHtml,
  /id="publish-create-pr"/
);

assert.match(
  adminHtml,
  /js\/admin-character-publish\.js/
);

console.log("admin character publication core test passed");
