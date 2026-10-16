const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const dir = path.join(__dirname, "../workers/bao-lab-credits-api/modules");
const read = file => fs.readFileSync(path.join(dir, file), "utf8");
const publication = read("admin-publication-routes.js");
const formatting = read("publication-format.js");
const transport = read("github-publication-transport.js");
const frontend = fs.readFileSync(path.join(__dirname, "../js/admin-character-publish.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "../admin-wallet.html"), "utf8");

for (const key of [
  "author_license_defaults", "work_license_submissions",
  "pending_review", "license_audit_write_failed",
  'delete publication.card.meta.license',
  "publication.card.meta.license = snapshot",
  "publication.catalogEntry.license = snapshot"
]) {
  assert.ok(publication.includes(key), "missing licensed publication safety check: " + key);
}
assert.match(frontend, /\/admin\/authors\/license-default/);
assert.match(frontend, /license_mode:/);
assert.match(adminHtml, /id="publish-license-mode"/);
assert.match(transport, /Third-party reuse terms:/);
assert.match(formatting, /const publishedCard =/);

function fakeDb() {
  const authors = new Map();
  let audits = [];
  return {
    authors,
    audits,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() {
          if (sql.startsWith("INSERT INTO author_license_defaults")) {
            const previous = authors.get(args[0]);
            authors.set(args[0], {
              policy_json: args[1],
              revision: (previous?.revision || 0) + 1,
              updated_at: "2026-10-16T12:00:00Z"
            });
          } else if (sql.startsWith("INSERT INTO work_license_submissions")) {
            audits.push(args);
          }
          return { success: true };
        },
        async first() {
          if (sql.startsWith("SELECT policy_json, revision")) return authors.get(args[0]) || null;
          return null;
        }
      };
    }
  };
}

async function jsonRequest(method, body, url = "https://worker.test/admin/authors/license-default") {
  return new Request(url, { method, ...(body ? {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  } : {}) });
}

(async () => {
  const { adminPublicationRoute } =
    await import(pathToFileURL(path.join(dir, "admin-publication-routes.js")).href);

  const db = fakeDb();
  const base = "/admin/authors/license-default";
  const get = async author => adminPublicationRoute(
    await jsonRequest("GET", null, "https://worker.test" + base + "?author_id=" + author),
    base, {}, db
  );
  const post = async policy => adminPublicationRoute(
    await jsonRequest("POST", { author_id: "banzhang", policy }), base, {}, db
  );

  const initial = await get("banzhang");
  assert.equal(initial.status, 200);
  const fallback = await initial.json();
  assert.equal(fallback.saved, false);
  assert.equal(fallback.revision, 0);
  assert.equal(fallback.policy.redistribution, "permission_required");
  assert.equal(fallback.policy.commercial_use, "prohibited");

  const custom = {
    redistribution: "prohibited",
    adaptations: "allowed",
    commercial_use: "permission_required",
    attribution_required: false
  };
  const saved = await post(custom);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  assert.deepEqual((await (await get("banzhang")).json()).policy, custom);
  assert.equal((await (await post(custom)).json()).revision, 2);

  const badPolicy = await post({ ...custom, attribution_required: "no" });
  assert.equal(badPolicy.status, 400);
  assert.equal((await badPolicy.json()).error, "invalid_license_policy");

  const polluted = await post({ ...custom, forged_field: "allow_everything" });
  assert.equal(polluted.status, 400);
  const badAuthor = await get("../bad");
  assert.equal(badAuthor.status, 400);

  // Unmatched paths must not touch D1 and should preserve route dispatch.
  const missing = await adminPublicationRoute(
    new Request("https://worker.test/admin/players"), "/admin/players", {}, db
  );
  assert.equal(missing, null);

  assert.equal(db.authors.get("banzhang").revision, 2);
  console.log("admin D1 author-license defaults and validation tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
