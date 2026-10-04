const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const WorkerHttp = \(\(\) => \{/,
  "HTTP helpers must remain grouped behind the internal WorkerHttp boundary"
);
for (const helper of ["withSecurityHeaders", "json", "fail", "readJsonWithLimit", "readJson", "validOrigin", "trustedCookieMutation", "cors"]) {
  assert.match(source, new RegExp("\\b" + helper + "\\b"), "WorkerHttp boundary is missing " + helper);
}

async function loadWorker() {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=()"
  );
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains"
  );
}

(async () => {
  const mod = await loadWorker();
  const worker = mod.default;
  const env = { ALLOWED_ORIGIN: "https://yorubay.com" };

  const blocked = await worker.fetch(
    new Request("https://api.example.test/chat", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    }),
    env
  );
  assert.equal(blocked.status, 403);
  assertSecurityHeaders(blocked);

  const preflight = await worker.fetch(
    new Request("https://api.example.test/chat", {
      method: "OPTIONS",
      headers: { Origin: "https://yorubay.com" },
    }),
    env
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "https://yorubay.com"
  );
  assertSecurityHeaders(preflight);

  const missingCookieOrigin = await worker.fetch(
    new Request("https://api.example.test/auth/logout", {
      method: "POST",
      headers: { cookie: "__Host-yorubay_session=test-session" },
    }),
    env
  );
  assert.equal(missingCookieOrigin.status, 403);
  assert.deepEqual(await missingCookieOrigin.json(), { error: "origin_required" });
  assertSecurityHeaders(missingCookieOrigin);

  const bearerWithoutOrigin = await worker.fetch(
    new Request("https://api.example.test/chat", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        cookie: "__Host-yorubay_session=stale-session",
      },
    }),
    env
  );
  assert.equal(bearerWithoutOrigin.status, 503, "Bearer clients must not be forced to send a browser Origin header");
  assertSecurityHeaders(bearerWithoutOrigin);

  const missingDb = await worker.fetch(
    new Request("https://api.example.test/health"),
    env
  );
  assert.equal(missingDb.status, 503);
  assertSecurityHeaders(missingDb);

  console.log("worker-security-headers-core: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
