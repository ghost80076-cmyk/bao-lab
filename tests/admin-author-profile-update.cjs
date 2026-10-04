const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const workerSource = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const authorProfilePublicationModuleSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/author-profile-publication.js"
  ),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/author-profile-publication\.js";/,
  "the Worker entry must import the extracted author profile publication module"
);
assert.doesNotMatch(
  workerEntrySource,
  /function createAuthorProfilePr\(/,
  "author profile publication implementation must not remain duplicated in worker.js"
);
assert.match(
  authorProfilePublicationModuleSource,
  /const WorkerAuthorProfilePublication = \(\(\) => \{/,
  "author profile PR writes must stay behind WorkerAuthorProfilePublication"
);

const instrumented =
  workerSource.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAuthorProfilePublication, prepareAuthorProfileUpdate, createAuthorProfilePr };";

const {
  WorkerAuthorProfilePublication,
  prepareAuthorProfileUpdate,
  createAuthorProfilePr,
} = new Function(instrumented)();

assert.equal(
  WorkerAuthorProfilePublication.createAuthorProfilePr,
  createAuthorProfilePr
);

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

assert.throws(
  () => prepareAuthorProfileUpdate({
    author_id: "bad author",
    author_name: "Bad",
  }),
  /invalid_author_id/
);

assert.throws(
  () => prepareAuthorProfileUpdate({
    author_id: "good-author",
    author_name: "",
  }),
  /author_name_required/
);

assert.throws(
  () => prepareAuthorProfileUpdate({
    author_id: "good-author",
    author_name: "Good",
    author_support_url: "http://example.com",
  }),
  /invalid_author_support_url/
);

const multipleSupport = prepareAuthorProfileUpdate({
  author_id: "good-author",
  author_name: "Good",
  support_links: [
    { label: "Ko-fi", url: "https://example.com/kofi" },
    { label: "街口支持", url: "https://example.com/jkopay" },
    { label: "重複", url: "https://example.com/kofi" }
  ]
});
assert.deepEqual(multipleSupport.profile.support_links, [
  { label: "Ko-fi", url: "https://example.com/kofi" },
  { label: "街口支持", url: "https://example.com/jkopay" }
]);

assert.throws(
  () => prepareAuthorProfileUpdate({
    author_id: "good-author",
    author_name: "Good",
    support_links: [
      { url: "https://example.com/1" },
      { url: "https://example.com/2" },
      { url: "https://example.com/3" },
      { url: "https://example.com/4" },
      { url: "https://example.com/5" },
      { url: "https://example.com/6" }
    ]
  }),
  /author_support_limit_reached/
);

assert.throws(
  () => prepareAuthorProfileUpdate({
    author_id: "good-author",
    author_name: "Good",
    support_links: [
      { label: "不安全", url: "http://example.com" }
    ]
  }),
  /invalid_author_support_url/
);

(async () => {
  const writes = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const apiPath = parsed.pathname.replace("/repos/test-owner/test-repo", "") + parsed.search;
    const method = String(options.method || "GET").toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;

    if (method === "GET" && apiPath === "/git/ref/heads/main") {
      return response({ object: { sha: "base-sha" } });
    }
    if (method === "GET" && apiPath === "/contents/data/authors.json?ref=main") {
      return response({
        sha: "authors-sha",
        content: encoded({
          schema_version: 1,
          authors: [{
            id: "night-writer",
            name: "舊作者名",
            bio: "舊簡介",
            support_links: [{
              label: "支持作者",
              url: "https://example.com/old"
            }],
            created_at: "2026-09-01T00:00:00.000Z",
            updated_at: "2026-09-01T00:00:00.000Z"
          }]
        })
      });
    }
    if (method === "POST" && apiPath === "/git/refs") {
      writes.push({ method, apiPath, body });
      return response({ ref: body.ref, object: { sha: body.sha } }, 201);
    }
    if (method === "PUT" && apiPath === "/contents/data/authors.json") {
      writes.push({ method, apiPath, body });
      return response({ content: { sha: "new-authors-sha" } });
    }
    if (method === "POST" && apiPath === "/pulls") {
      writes.push({ method, apiPath, body });
      return response({ number: 501, html_url: "https://github.test/pr/501" }, 201);
    }

    throw new Error("Unexpected GitHub request: " + method + " " + apiPath);
  };

  try {
    const prepared = prepareAuthorProfileUpdate({
      author_id: "night-writer",
      author_name: "夜裡寫故事的人",
      author_bio: "新版作者簡介",
      author_support_label: "支持作者",
      author_support_url: ""
    });

    const result = await createAuthorProfilePr(env, prepared);
    assert.equal(result.author_profile_mode, "update");
    assert.equal(result.author_id, "night-writer");
    assert.equal(result.author_directory_path, "data/authors.json");

    const authorWrite = writes.find(item => item.apiPath === "/contents/data/authors.json");
    assert.ok(authorWrite);
    assert.equal(authorWrite.body.sha, "authors-sha");

    const nextDirectory = JSON.parse(
      Buffer.from(authorWrite.body.content, "base64").toString("utf8")
    );
    const author = nextDirectory.authors[0];
    assert.equal(author.id, "night-writer");
    assert.equal(author.name, "夜裡寫故事的人");
    assert.equal(author.bio, "新版作者簡介");
    assert.deepEqual(author.support_links, []);
    assert.equal(author.created_at, "2026-09-01T00:00:00.000Z");
    assert.notEqual(author.updated_at, "2026-09-01T00:00:00.000Z");

    assert.equal(
      writes.some(item =>
        item.apiPath.includes("/contents/data/characters") ||
        item.apiPath.includes("/character-catalog/")
      ),
      false
    );

    const prWrite = writes.find(item => item.apiPath === "/pulls");
    assert.ok(prWrite);
    assert.match(prWrite.body.title, /Update author/);
    assert.match(prWrite.body.body, /Work catalog \/ published versions: unchanged/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("admin author profile update test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
