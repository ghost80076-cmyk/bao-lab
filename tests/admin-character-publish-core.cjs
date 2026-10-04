const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const workerSource = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const publicationModuleSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/publication-format.js"
  ),
  "utf8"
);
const githubPublicationTransportSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/github-publication-transport.js"
  ),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/publication-format\.js";/,
  "the Worker entry must import the extracted publication format module"
);
assert.doesNotMatch(
  workerEntrySource,
  /function prepareCharacterPublication\(/,
  "publication format implementation must not remain duplicated in worker.js"
);
assert.match(
  publicationModuleSource,
  /const WorkerPublicationFormat = \(\(\) => \{/,
  "publication validation and shaping helpers must stay grouped behind WorkerPublicationFormat"
);
assert.match(
  workerEntrySource,
  /from "\.\/modules\/github-publication-transport\.js";/,
  "the Worker entry must import the extracted GitHub publication transport module"
);
assert.doesNotMatch(
  workerEntrySource,
  /function githubSettings\(/,
  "GitHub publication transport implementation must not remain duplicated in worker.js"
);
assert.match(
  githubPublicationTransportSource,
  /const WorkerGithubPublicationTransport = \(\(\) => \{/,
  "GitHub publication transport must stay grouped behind WorkerGithubPublicationTransport"
);
for (const helper of [
  "publishError",
  "plainObject",
  "redactPublishSecrets",
  "cleanStringList",
  "characterBucket",
  "prepareCharacterPublication",
  "mergePublishedCatalogEntry",
  "mergeAuthorProfile",
  "prepareAuthorProfileUpdate",
]) {
  assert.match(workerSource, new RegExp("\\b" + helper + "\\b"), "WorkerPublicationFormat is missing " + helper);
}

const instrumented =
  workerSource.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerGithubPublicationTransport, prepareCharacterPublication, mergePublishedCatalogEntry, mergeAuthorProfile, githubSettings };";

const {
  WorkerGithubPublicationTransport,
  prepareCharacterPublication,
  mergePublishedCatalogEntry,
  mergeAuthorProfile,
  githubSettings,
} = new Function(instrumented)();

assert.equal(WorkerGithubPublicationTransport.githubSettings, githubSettings);
assert.equal(
  typeof WorkerGithubPublicationTransport.githubApi,
  "function"
);
assert.equal(
  typeof WorkerGithubPublicationTransport.createCharacterPublicationPr,
  "function"
);

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
assert.equal(prepared.mode, "create");
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
assert.equal(prepared.catalogEntry.published_version, 1);
assert.equal(prepared.catalogEntry.version_published_at, prepared.catalogEntry.published_at);

const preparedAuthor = prepareCharacterPublication({
  rights_confirmed: true,
  author_id: "test-author",
  author_name: "測試作者",
  author_bio: "寫長篇世界故事。",
  author_support_label: "替作者留一盞燈",
  author_support_url: "https://example.com/support",
  card: {
    meta: {
      id: "author-work",
      name: "Author Work",
      title: "Author Work",
      category: "male",
    },
    content: {
      greeting: "hello",
      system_prompt: "prompt",
    },
  },
});
assert.equal(preparedAuthor.authorId, "test-author");
assert.equal(preparedAuthor.card.meta.creator_id, "test-author");
assert.equal(preparedAuthor.catalogEntry.author_id, "test-author");
assert.equal(preparedAuthor.authorProfile.id, "test-author");
assert.equal(preparedAuthor.authorProfile.name, "測試作者");
assert.equal(preparedAuthor.authorProfile.support_links[0].url, "https://example.com/support");

const mergedAuthor = mergeAuthorProfile(
  {
    id: "test-author",
    name: "舊名稱",
    bio: "舊簡介",
    support_links: [{ label: "支持作者", url: "https://example.com/old" }],
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "test-author",
    name: "新名稱",
  },
  "2026-10-02T00:00:00.000Z"
);
assert.equal(mergedAuthor.name, "新名稱");
assert.equal(mergedAuthor.bio, "舊簡介");
assert.deepEqual(mergedAuthor.support_links, [
  { label: "支持作者", url: "https://example.com/old" },
]);
assert.equal(mergedAuthor.created_at, "2026-09-01T00:00:00.000Z");
assert.equal(mergedAuthor.updated_at, "2026-10-02T00:00:00.000Z");

assert.throws(
  () => prepareCharacterPublication({
    rights_confirmed: true,
    author_id: "Bad Author",
    card: {
      meta: { id: "bad-author-id", name: "Bad Author", category: "male" },
      content: { greeting: "hello", system_prompt: "prompt" },
    },
  }),
  /invalid_author_id/
);

assert.throws(
  () => prepareCharacterPublication({
    rights_confirmed: true,
    author_support_url: "https://example.com/support",
    card: {
      meta: { id: "support-no-author", name: "Support", category: "male" },
      content: { greeting: "hello", system_prompt: "prompt" },
    },
  }),
  /author_id_required_for_support/
);

assert.throws(
  () => prepareCharacterPublication({
    rights_confirmed: true,
    author_id: "test-author",
    author_support_url: "http://example.com/support",
    card: {
      meta: { id: "bad-support-url", name: "Bad Support", category: "male" },
      content: { greeting: "hello", system_prompt: "prompt" },
    },
  }),
  /invalid_author_support_url/
);

const preparedUpdate = prepareCharacterPublication({
  rights_confirmed: true,
  publication_mode: "update",
  author_name: "Test Author",
  card: {
    schema_version: "1.5",
    meta: {
      id: "community-test",
      name: "Community Test v2",
      title: "Community Test v2",
      category: "female",
      tags: ["updated"],
      description: "version two",
    },
    content: {
      greeting: "hello again",
      system_prompt: "stay in character",
    },
    gameplay: {
      supported_modes: { immersive: true, world: true },
    },
    presentation: {
      supported_display: { text: true, ui: true },
    },
  },
});
assert.equal(preparedUpdate.mode, "update");

const existingPublishedEntry = {
  id: "community-test",
  file: "data/characters/community/28/community-test.json",
  name: "Community Test",
  title: "Community Test",
  avatar: "assets/community/28/community-test.png",
  category: "female",
  rating: "general",
  tags: ["old"],
  description: "old",
  published_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  published_version: 3,
  version_published_at: "2026-09-15T00:00:00.000Z",
  author: "Original Author",
};

const mergedPublishedEntry = mergePublishedCatalogEntry(
  existingPublishedEntry,
  {
    ...preparedUpdate.catalogEntry,
    file: "data/characters/community/ff/should-not-move.json",
  },
  "2026-10-02T00:00:00.000Z"
);
assert.equal(mergedPublishedEntry.file, existingPublishedEntry.file);
assert.equal(mergedPublishedEntry.published_at, existingPublishedEntry.published_at);
assert.equal(mergedPublishedEntry.updated_at, "2026-10-02T00:00:00.000Z");
assert.equal(mergedPublishedEntry.version_published_at, "2026-10-02T00:00:00.000Z");
assert.equal(mergedPublishedEntry.published_version, 4);
assert.equal(mergedPublishedEntry.title, "Community Test v2");
assert.equal(mergedPublishedEntry.author, "Test Author");

assert.throws(
  () => prepareCharacterPublication({
    rights_confirmed: true,
    publication_mode: "replace",
    card: {
      meta: { id: "bad-mode", name: "Bad Mode", category: "male" },
      content: { greeting: "hello", system_prompt: "prompt" },
    },
  }),
  /invalid_publication_mode/
);

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

assert.match(
  uiSource,
  /publication_mode/
);

assert.match(
  uiSource,
  /author_id/
);

assert.match(
  uiSource,
  /author_support_url/
);

assert.match(
  workerSource,
  /mergePublishedCatalogEntry/
);

assert.match(
  workerSource,
  /character_not_published/
);

assert.match(
  workerSource,
  /published_version[\s\S]*previousVersion[\s\S]*\+/
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
  /id="publish-mode"/
);

assert.match(
  adminHtml,
  /id="publish-author-id"/
);

assert.match(
  adminHtml,
  /id="publish-author-support-url"/
);

assert.match(
  adminHtml,
  /不代收、不轉金流、不抽成/
);

assert.match(
  adminHtml,
  /更新既有作品（v2\+）/
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
