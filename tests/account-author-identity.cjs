const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workerSource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  workerSource,
  /const WorkerAuthorOwnership = \(\(\) => \{/,
  "author identity persistence and claim helpers must stay grouped behind WorkerAuthorOwnership"
);
for (const helper of [
  "prepareAuthorIdentityClaim",
  "ensureAuthorOwnerships",
  "ownedAuthorIdentities",
  "publicAuthorIdExists",
  "claimAuthorIdentity",
]) {
  assert.match(workerSource, new RegExp("\\b" + helper + "\\b"), "WorkerAuthorOwnership is missing " + helper);
}

const instrumented =
  workerSource.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { prepareAuthorIdentityClaim, claimAuthorIdentity, ownedAuthorIdentities };";

const {
  prepareAuthorIdentityClaim,
  claimAuthorIdentity,
  ownedAuthorIdentities,
} = new Function(instrumented)();

assert.deepEqual(
  prepareAuthorIdentityClaim({ author_id: "Night-Writer" }),
  { authorId: "night-writer" }
);

assert.throws(
  () => prepareAuthorIdentityClaim({ author_id: "x" }),
  /invalid_author_id/
);

assert.throws(
  () => prepareAuthorIdentityClaim({ author_id: "bad author" }),
  /invalid_author_id/
);

function makeDb(seed = []) {
  const owners = seed.map(item => ({ ...item }));

  const statement = sql => {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    let args = [];

    return {
      bind(...values) {
        args = values;
        return this;
      },
      async run() {
        if (normalized.startsWith("create table") || normalized.startsWith("create index")) {
          return { success: true };
        }

        if (normalized.includes("insert into author_ownerships")) {
          const [authorId, playerId] = args;
          owners.push({
            author_id: authorId,
            player_id: playerId,
            created_at: "2026-10-02T00:00:00.000Z"
          });
          return { success: true };
        }

        throw new Error("Unexpected run SQL: " + normalized);
      },
      async first() {
        if (
          normalized.includes("from author_ownerships") &&
          normalized.includes("where author_id = ?") &&
          normalized.includes("and player_id = ?")
        ) {
          const [authorId, playerId] = args;
          return owners.find(item => item.author_id === authorId && item.player_id === playerId) || null;
        }

        if (
          normalized.includes("from author_ownerships") &&
          normalized.includes("where author_id = ?")
        ) {
          const [authorId] = args;
          return owners.find(item => item.author_id === authorId) || null;
        }

        throw new Error("Unexpected first SQL: " + normalized);
      },
      async all() {
        if (
          normalized.includes("from author_ownerships") &&
          normalized.includes("where player_id = ?")
        ) {
          const [playerId] = args;
          return {
            results: owners
              .filter(item => item.player_id === playerId)
              .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          };
        }

        throw new Error("Unexpected all SQL: " + normalized);
      }
    };
  };

  return {
    owners,
    prepare: statement
  };
}

function githubResponse(authors) {
  return new Response(JSON.stringify({
    sha: "authors-sha",
    content: Buffer.from(
      JSON.stringify({ schema_version: 1, authors }),
      "utf8"
    ).toString("base64")
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

(async () => {
  const originalFetch = globalThis.fetch;
  const env = {
    GITHUB_TOKEN: "token",
    GITHUB_REPO: "test-owner/test-repo",
    GITHUB_BASE_BRANCH: "main",
  };

  try {
    globalThis.fetch = async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/contents/data/authors.json")) {
        return githubResponse([]);
      }
      throw new Error("Unexpected fetch: " + url);
    };

    const db = makeDb();
    const player = { id: "player-1" };
    const claim = await claimAuthorIdentity(
      env,
      db,
      player,
      { author_id: "night-writer" }
    );

    assert.equal(claim.author_id, "night-writer");
    assert.equal(claim.existing, false);
    assert.equal(db.owners.length, 1);

    const same = await claimAuthorIdentity(
      env,
      db,
      player,
      { author_id: "night-writer" }
    );
    assert.equal(same.existing, true);

    const list = await ownedAuthorIdentities(db, "player-1");
    assert.equal(list.length, 1);
    assert.equal(list[0].author_id, "night-writer");

    await assert.rejects(
      () => claimAuthorIdentity(
        env,
        db,
        { id: "player-2" },
        { author_id: "night-writer" }
      ),
      /author_id_taken/
    );

    await assert.rejects(
      () => claimAuthorIdentity(
        env,
        db,
        player,
        { author_id: "second-name" }
      ),
      /author_identity_limit_reached/
    );

    const reservedDb = makeDb();
    globalThis.fetch = async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/contents/data/authors.json")) {
        return githubResponse([{ id: "reserved-author", name: "Reserved" }]);
      }
      throw new Error("Unexpected fetch: " + url);
    };

    await assert.rejects(
      () => claimAuthorIdentity(
        env,
        reservedDb,
        { id: "player-3" },
        { author_id: "reserved-author" }
      ),
      /author_id_reserved/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const accountHtml = fs.readFileSync(
    path.join(__dirname, "../account.html"),
    "utf8"
  );

  assert.match(accountHtml, /作者身份是可選的公開身份，不等於登入帳號/);
  assert.match(accountHtml, /\/me\/authors\/claim/);
  assert.match(accountHtml, /\/me\/authors\/profile-pr/);
  assert.match(accountHtml, /夜灣不代收、不轉金流、不抽成/);
  assert.match(workerSource, /CREATE TABLE IF NOT EXISTS author_ownerships/);
  assert.match(workerSource, /author_identity_not_owned/);

  console.log("account author identity test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
