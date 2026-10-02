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

const encoded = value => Buffer.from(
  typeof value === "string" ? value : JSON.stringify(value),
  "utf8"
).toString("base64");

function response(payload, status = 200) {
  return new Response(
    payload == null ? "" : JSON.stringify(payload),
    { status, headers: { "content-type": "application/json" } }
  );
}

const officialCatalog = [{
  id: "author-work",
  file: "data/characters/general/author-work.json",
  name: "Author Work",
  title: "Author Work",
  avatar: "https://example.com/cover.png",
  category: "female",
  rating: "general",
  tags: [],
  description: "old",
  published_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  published_version: 1,
  version_published_at: "2026-09-01T00:00:00.000Z"
}];

const manifest = {
  schema_version: 1,
  page_size: 48,
  total: 0,
  pages: []
};

const authorDirectory = {
  schema_version: 1,
  authors: []
};

(async () => {
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
    if (method === "GET" && apiPath === "/contents/data/characters/general/author-work.json?ref=main") {
      return response({ sha: "character-sha", content: encoded({}) });
    }
    if (method === "GET" && apiPath === "/contents/data/authors.json?ref=main") {
      return response({ sha: "authors-sha", content: encoded(authorDirectory) });
    }
    if (method === "POST" && apiPath === "/git/refs") {
      writes.push({ method, apiPath, body });
      return response({ ref: body.ref, object: { sha: body.sha } }, 201);
    }
    if (method === "PUT" && [
      "/contents/data/characters/general/author-work.json",
      "/contents/data/characters.json",
      "/contents/data/authors.json"
    ].includes(apiPath)) {
      writes.push({ method, apiPath, body });
      return response({ content: { sha: "written-sha" } });
    }
    if (method === "POST" && apiPath === "/pulls") {
      writes.push({ method, apiPath, body });
      return response({ number: 402, html_url: "https://github.test/pr/402" }, 201);
    }

    throw new Error("Unexpected GitHub request: " + method + " " + apiPath);
  };

  try {
    const publication = prepareCharacterPublication({
      rights_confirmed: true,
      publication_mode: "update",
      author_id: "night-writer",
      author_name: "夜裡寫故事的人",
      author_bio: "把故事留在夜裡。",
      author_support_label: "替作者留一盞燈",
      author_support_url: "https://example.com/night-writer/support",
      card: {
        schema_version: "1.5",
        meta: {
          id: "author-work",
          name: "Author Work v2",
          title: "Author Work v2",
          avatar: "https://example.com/cover.png",
          category: "female",
          description: "new",
        },
        content: {
          greeting: "hello again",
          system_prompt: "stay in character",
        },
      },
    });

    const result = await createCharacterPublicationPr(env, publication);
    assert.equal(result.author_id, "night-writer");
    assert.equal(result.author_directory_path, "data/authors.json");

    const catalogWrite = writes.find(item => item.apiPath === "/contents/data/characters.json");
    assert.ok(catalogWrite);
    const nextCatalog = JSON.parse(
      Buffer.from(catalogWrite.body.content, "base64").toString("utf8")
    );
    assert.equal(nextCatalog[0].author_id, "night-writer");
    assert.equal(nextCatalog[0].author, "夜裡寫故事的人");

    const characterWrite = writes.find(item =>
      item.apiPath === "/contents/data/characters/general/author-work.json"
    );
    const nextCard = JSON.parse(
      Buffer.from(characterWrite.body.content, "base64").toString("utf8")
    );
    assert.equal(nextCard.meta.creator_id, "night-writer");
    assert.equal(nextCard.meta.creator, "夜裡寫故事的人");

    const authorWrite = writes.find(item => item.apiPath === "/contents/data/authors.json");
    assert.ok(authorWrite);
    assert.equal(authorWrite.body.sha, "authors-sha");
    const nextAuthors = JSON.parse(
      Buffer.from(authorWrite.body.content, "base64").toString("utf8")
    );
    assert.equal(nextAuthors.authors.length, 1);
    assert.equal(nextAuthors.authors[0].id, "night-writer");
    assert.equal(nextAuthors.authors[0].name, "夜裡寫故事的人");
    assert.equal(nextAuthors.authors[0].bio, "把故事留在夜裡。");
    assert.deepEqual(nextAuthors.authors[0].support_links, [{
      label: "替作者留一盞燈",
      url: "https://example.com/night-writer/support"
    }]);

    const prWrite = writes.find(item => item.apiPath === "/pulls");
    assert.match(prWrite.body.body, /Author ID: night-writer/);
    assert.match(prWrite.body.body, /YoruBay does not process the payment/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("admin author profile publication test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
