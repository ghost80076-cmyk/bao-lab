const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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
  const modulePath = path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/http.js"
  );
  const httpModule = await import(pathToFileURL(modulePath).href);

  const {
    WorkerHttp,
    SESSION_COOKIE_NAME,
    cors,
    fail,
    json,
    readJson,
    readJsonWithLimit,
    trustedCookieMutation,
    validOrigin,
    withSecurityHeaders,
  } = httpModule;

  assert.equal(SESSION_COOKIE_NAME, "__Host-yorubay_session");
  assert.equal(WorkerHttp.json, json);
  assert.equal(WorkerHttp.fail, fail);
  assert.equal(WorkerHttp.readJsonWithLimit, readJsonWithLimit);

  const secured = withSecurityHeaders(new Response("ok"));
  assertSecurityHeaders(secured);

  const jsonResponse = json({ ok: true }, 201);
  assert.equal(jsonResponse.status, 201);
  assert.equal(jsonResponse.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(jsonResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await jsonResponse.clone().json(), { ok: true });
  assertSecurityHeaders(jsonResponse);

  const failed = fail("bad_request", 422, { detail: "invalid" });
  assert.equal(failed.status, 422);
  assert.deepEqual(await failed.json(), {
    error: "bad_request",
    detail: "invalid",
  });

  const bodyRequest = new Request("https://worker.test/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hello: "夜灣" }),
  });
  assert.deepEqual(await readJson(bodyRequest), { hello: "夜灣" });

  await assert.rejects(
    () => readJson(new Request("https://worker.test/test", { method: "POST" })),
    /empty_body/
  );

  await assert.rejects(
    () => readJsonWithLimit(
      new Request("https://worker.test/test", {
        method: "POST",
        body: "{invalid",
      }),
      100
    ),
    /invalid_json/
  );

  await assert.rejects(
    () => readJsonWithLimit(
      new Request("https://worker.test/test", {
        method: "POST",
        body: JSON.stringify({ value: "1234567890" }),
      }),
      5
    ),
    /request_too_large/
  );

  const noOrigin = validOrigin(
    new Request("https://worker.test/test"),
    { ALLOWED_ORIGIN: "https://yorubay.com" }
  );
  assert.deepEqual(noOrigin, { allowed: true, origin: null });

  const allowedOrigin = validOrigin(
    new Request("https://worker.test/test", {
      headers: { origin: "https://yorubay.com" },
    }),
    { ALLOWED_ORIGIN: "https://yorubay.com, https://www.yorubay.com" }
  );
  assert.deepEqual(allowedOrigin, {
    allowed: true,
    origin: "https://yorubay.com",
  });

  const deniedOrigin = validOrigin(
    new Request("https://worker.test/test", {
      headers: { origin: "https://evil.example" },
    }),
    { ALLOWED_ORIGIN: "https://yorubay.com" }
  );
  assert.deepEqual(deniedOrigin, {
    allowed: false,
    origin: "https://evil.example",
  });

  assert.equal(
    trustedCookieMutation(
      new Request("https://worker.test/test", { method: "GET" }),
      deniedOrigin
    ),
    true
  );

  assert.equal(
    trustedCookieMutation(
      new Request("https://worker.test/test", {
        method: "POST",
        headers: { authorization: "Bearer token" },
      }),
      deniedOrigin
    ),
    true
  );

  const cookieMutation = new Request("https://worker.test/test", {
    method: "POST",
    headers: { cookie: "__Host-yorubay_session=session-token" },
  });
  assert.equal(trustedCookieMutation(cookieMutation, deniedOrigin), false);
  assert.equal(trustedCookieMutation(cookieMutation, allowedOrigin), true);

  const corsResponse = cors(
    new Response("ok", { status: 204 }),
    "https://yorubay.com"
  );
  assert.equal(
    corsResponse.headers.get("access-control-allow-origin"),
    "https://yorubay.com"
  );
  assert.equal(
    corsResponse.headers.get("access-control-allow-credentials"),
    "true"
  );
  assert.equal(corsResponse.headers.get("vary"), "Origin");
  assertSecurityHeaders(corsResponse);

  console.log("worker HTTP core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
