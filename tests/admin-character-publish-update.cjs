const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const workerSource = loadWorkerTestSource();

const instrumented =
  workerSource.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { prepareCharacterPublication, createCharacterPublicationPr };";

const {
  prepareCharacterPublication,
  createCharacterPublicationPr,
} = new Function(instrumented)();

const env = {
  GITHUB_TOKEN: "token",
  GITHUB_REPO: "test-owner/test-repo",
  GITHUB_BASE_BRANCH: "main",
};

const originalPublishedAt = "2026-09-01T00:00:00.000Z";
const officialCatalog = [
  {
    id: "published-test",
    file: "data/characters/general/published-test.json",
    name: "Published Test",
    title: "Published Test",
    avatar: "https://example.com/cover.png",
    category: "female",
    rating: "general",
    tags: ["old"],
    description: "old description",
    published_at: originalPublishedAt,
    updated_at: "2026-09-15T00:00:00.000Z",
    published_version: 1,
    version_published_at: "2026-09-15T00:00:00.000Z",
    author: "Original Author",
  },
];

const manifest = {
  schema_version: 1,
  page_size: 48,
  total: 0,
  pages: [],
};

const encoded = value => Buffer.from(
  typeof value === "string" ? value : JSON.stringify(value),
  "utf8"
).toString("base64");

function response(payload, status = 200) {
  return new Response(
    payload == null ? "" : JSON.stringify(payload),
    {
      status,
      headers: { "content-type": "application/json" },
    }
  );
}

async function runUpdate() {
  const writes = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const apiPath = parsed.pathname.replace("/repos/test-owner/test-repo", "") + parsed.search;
    const method = String(options.method || "GET").toUpperCase();
    let body = null;
    if (options.body) body = JSON.parse(options.body);

    if (method === "GET" && apiPath === "/git/ref/heads/main") {
      return response({ object: { sha: "base-sha" } });
    }
    if (method === "GET" && apiPath === "/contents/data/characters.json?ref=main") {
      return response({ sha: "catalog-sha", content: encoded(officialCatalog) });
    }
    if (method === "GET" && apiPath === "/contents/data/character-catalog/community/manifest.json?ref=main") {
      return response({ sha: "manifest-sha", content: encoded(manifest) });
    }
    if (method === "GET" && apiPath === "/contents/data/characters/general/published-test.json?ref=main") {
      return response({ sha: "character-sha", content: encoded({}) });
    }
    if (method === "POST" && apiPath === "/git/refs") {
      writes.push({ method, apiPath, body });
      return response({ ref: body.ref, object: { sha: body.sha } }, 201);
    }
    if (method === "PUT" && apiPath === "/contents/data/characters/general/published-test.json") {
      writes.push({ method, apiPath, body });
      return response({ content: { sha: "new-character-sha" } });
    }
    if (method === "PUT" && apiPath === "/contents/data/characters.json") {
      writes.push({ method, apiPath, body });
      return response({ content: { sha: "new-catalog-sha" } });
    }
    if (method === "POST" && apiPath === "/pulls") {
      writes.push({ method, apiPath, body });
      return response({ number: 321, html_url: "https://github.test/pr/321" }, 201);
    }

    throw new Error("Unexpected GitHub request: " + method + " " + apiPath);
  };

  try {
    const publication = prepareCharacterPublication({
      rights_confirmed: true,
      publication_mode: "update",
      author_name: "Updated Author",
      card: {
        schema_version: "1.5",
        meta: {
          id: "published-test",
          name: "Published Test v2",
          title: "Published Test v2",
          avatar: "https://example.com/cover.png",
          category: "female",
          tags: ["updated"],
          description: "new description",
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

    const result = await createCharacterPublicationPr(env, publication);
    assert.equal(result.publication_mode, "update");
    assert.equal(result.published_version, 2);
    assert.equal(result.character_path, "data/characters/general/published-test.json");
    assert.equal(result.catalog_page_path, "data/characters.json");

    const characterWrite = writes.find(item =>
      item.method === "PUT" &&
      item.apiPath === "/contents/data/characters/general/published-test.json"
    );
    assert.ok(characterWrite);
    assert.equal(characterWrite.body.sha, "character-sha");

    const catalogWrite = writes.find(item =>
      item.method === "PUT" &&
      item.apiPath === "/contents/data/characters.json"
    );
    assert.ok(catalogWrite);
    assert.equal(catalogWrite.body.sha, "catalog-sha");

    const nextCatalog = JSON.parse(
      Buffer.from(catalogWrite.body.content, "base64").toString("utf8")
    );
    assert.equal(nextCatalog[0].published_version, 2);
    assert.equal(nextCatalog[0].published_at, originalPublishedAt);
    assert.equal(nextCatalog[0].title, "Published Test v2");
    assert.equal(nextCatalog[0].author, "Updated Author");
    assert.notEqual(nextCatalog[0].updated_at, originalPublishedAt);
    assert.equal(nextCatalog[0].version_published_at, nextCatalog[0].updated_at);

    assert.equal(
      writes.some(item =>
        item.method === "PUT" &&
        item.apiPath === "/contents/data/character-catalog/community/manifest.json"
      ),
      false
    );

    const prWrite = writes.find(item =>
      item.method === "POST" &&
      item.apiPath === "/pulls"
    );
    assert.ok(prWrite);
    assert.match(prWrite.body.title, /v2/);
    assert.match(prWrite.body.body, /Publication mode: update/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runCreateCollision() {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const apiPath = parsed.pathname.replace("/repos/test-owner/test-repo", "") + parsed.search;
    const method = String(options.method || "GET").toUpperCase();
    calls.push({ method, apiPath });

    if (method === "GET" && apiPath === "/git/ref/heads/main") {
      return response({ object: { sha: "base-sha" } });
    }
    if (method === "GET" && apiPath === "/contents/data/characters.json?ref=main") {
      return response({ sha: "catalog-sha", content: encoded(officialCatalog) });
    }
    if (method === "GET" && apiPath === "/contents/data/character-catalog/community/manifest.json?ref=main") {
      return response({ sha: "manifest-sha", content: encoded(manifest) });
    }

    throw new Error("Unexpected GitHub request: " + method + " " + apiPath);
  };

  try {
    const publication = prepareCharacterPublication({
      rights_confirmed: true,
      publication_mode: "create",
      card: {
        meta: {
          id: "published-test",
          name: "Collision",
          title: "Collision",
          category: "female",
        },
        content: {
          greeting: "hello",
          system_prompt: "prompt",
        },
      },
    });

    await assert.rejects(
      () => createCharacterPublicationPr(env, publication),
      /character_already_published/
    );
    assert.equal(calls.some(item => item.method === "POST"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

(async () => {
  await runUpdate();
  await runCreateCollision();
  console.log("admin character publication update test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
