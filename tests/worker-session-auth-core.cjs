const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { tokenFrom, cookieFrom, sessionTokenFrom, withSessionCookie, clearSessionCookie, playerFor, createSession, sha256Hex };";

const {
  tokenFrom,
  cookieFrom,
  sessionTokenFrom,
  withSessionCookie,
  clearSessionCookie,
  playerFor,
  createSession,
  sha256Hex,
} = new Function(instrumented)();

(async () => {
  const bearerRequest = new Request("https://api.example.test/me", {
    headers: {
      authorization: "Bearer bearer-token",
      cookie: "__Host-yorubay_session=cookie-token",
    },
  });
  assert.equal(tokenFrom(bearerRequest), "bearer-token");
  assert.equal(cookieFrom(bearerRequest, "__Host-yorubay_session"), "cookie-token");
  assert.equal(sessionTokenFrom(bearerRequest), "bearer-token", "Bearer auth must keep precedence over the session cookie");

  const cookieResponse = withSessionCookie(
    new Response("ok", { status: 200 }),
    "yb_s_test-token",
    new Date(Date.now() + 60_000).toISOString()
  );
  const setCookie = cookieResponse.headers.get("set-cookie");
  assert.match(setCookie, /^__Host-yorubay_session=yb_s_test-token;/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, /Domain=/i);

  const cleared = clearSessionCookie(new Response("ok"));
  assert.match(cleared.headers.get("set-cookie"), /Max-Age=0/);

  const writes = [];
  const createDb = {
    prepare(sql) {
      return {
        bind(...args) {
          writes.push({ sql: String(sql), args });
          return this;
        },
        async run() {
          return { success: true };
        },
      };
    },
  };

  const session = await createSession(createDb, "player-1", { SESSION_TTL_DAYS: "2" });
  assert.match(session.sessionToken, /^yb_s_[A-Za-z0-9_-]+$/);
  assert.ok(session.sessionId);
  assert.ok(Date.parse(session.expiresAt) > Date.now());
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /INSERT INTO auth_sessions/);
  assert.equal(writes[0].args[1], "player-1");
  assert.equal(writes[0].args[2], await sha256Hex(session.sessionToken));
  assert.notEqual(writes[0].args[2], session.sessionToken, "auth_sessions must store the token hash, never the raw token");

  const requestToken = "yb_s_lookup-token";
  const expectedHash = await sha256Hex(requestToken);
  const lookups = [];
  const sessionDb = {
    prepare(sql) {
      const query = String(sql);
      return {
        bind(...args) {
          lookups.push({ query, args });
          return this;
        },
        async first() {
          if (/FROM auth_sessions s/.test(query)) {
            return {
              id: "player-2",
              public_id: "YR-TEST-USER",
              enabled: 1,
              username: "reader",
              display_name: "Reader",
              session_id: "session-2",
              expires_at: "2099-01-01T00:00:00.000Z",
            };
          }
          throw new Error("legacy lookup should not run when a valid session exists");
        },
      };
    },
  };

  const found = await playerFor(
    new Request("https://api.example.test/me", {
      headers: { cookie: "__Host-yorubay_session=" + encodeURIComponent(requestToken) },
    }),
    sessionDb
  );
  assert.equal(found.auth_type, "session");
  assert.equal(found.id, "player-2");
  assert.equal(lookups[0].args[0], expectedHash);

  const legacyToken = "bao_legacy-token";
  const legacyHash = await sha256Hex(legacyToken);
  const legacyLookups = [];
  const legacyDb = {
    prepare(sql) {
      const query = String(sql);
      return {
        bind(...args) {
          legacyLookups.push({ query, args });
          return this;
        },
        async first() {
          if (/FROM auth_sessions s/.test(query)) return null;
          if (/FROM players p/.test(query)) {
            return {
              id: "legacy-player",
              public_id: "YR-OLD-USER1",
              enabled: 1,
            };
          }
          return null;
        },
      };
    },
  };

  const legacy = await playerFor(
    new Request("https://api.example.test/me", {
      headers: { authorization: "Bearer " + legacyToken },
    }),
    legacyDb
  );
  assert.equal(legacy.auth_type, "legacy");
  assert.equal(legacy.id, "legacy-player");
  assert.equal(legacyLookups[0].args[0], legacyHash);
  assert.equal(legacyLookups[1].args[0], legacyHash);

  console.log("worker session auth core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
