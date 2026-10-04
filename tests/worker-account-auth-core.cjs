const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();

assert.match(
  source,
  /const WorkerAccountAuth = \(\(\) => \{/,
  "account auth route handlers must stay grouped behind WorkerAccountAuth"
);
for (const helper of [
  "authRegister",
  "authLogin",
  "authLogout",
  "authRecover",
]) {
  assert.match(source, new RegExp("\\b" + helper + "\\b"), "WorkerAccountAuth is missing " + helper);
}

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { authRegister, authLogin, authLogout, authRecover };";

const {
  authRegister,
  authLogin,
  authLogout,
  authRecover,
} = new Function(instrumented)();

const request = body => new Request("https://api.example.test/auth", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

(async () => {
  const noDb = {
    prepare() {
      throw new Error("database must not be touched for invalid input");
    },
    batch() {
      throw new Error("database must not be touched for invalid input");
    },
  };

  const badRegister = await authRegister(
    request({ username: "x", password: "short" }),
    { REGISTRATION_MODE: "open" },
    noDb
  );
  assert.equal(badRegister.status, 400);
  assert.equal((await badRegister.json()).error, "invalid_registration");

  const badLogin = await authLogin(
    request({ username: "x", password: "short" }),
    {},
    noDb
  );
  assert.equal(badLogin.status, 401);
  assert.equal((await badLogin.json()).error, "invalid_credentials");

  const badRecover = await authRecover(
    request({
      public_id: "bad",
      recovery_code: "short",
      new_password: "short",
    }),
    {},
    noDb
  );
  assert.equal(badRecover.status, 400);
  assert.equal((await badRecover.json()).error, "invalid_recovery_request");

  const deniedEnv = {
    REGISTRATION_MODE: "open",
    AUTH_RATE_LIMITER: {
      async limit() {
        return { success: false };
      },
    },
  };
  const deniedRegister = await authRegister(
    request({
      username: "new-reader",
      display_name: "New Reader",
      password: "long-enough-password",
    }),
    deniedEnv,
    noDb
  );
  assert.equal(deniedRegister.status, 429);
  assert.equal((await deniedRegister.json()).error, "auth_rate_limited");

  const deniedLogin = await authLogin(
    request({
      username: "valid-reader",
      password: "long-enough-password",
    }),
    deniedEnv,
    noDb
  );
  assert.equal(deniedLogin.status, 429);
  assert.equal((await deniedLogin.json()).error, "auth_rate_limited");

  const deniedRecovery = await authRecover(
    request({
      public_id: "YR-ABCD-1234",
      recovery_code: "A".repeat(20),
      new_password: "long-enough-password",
    }),
    deniedEnv,
    noDb
  );
  assert.equal(deniedRecovery.status, 429);
  assert.equal((await deniedRecovery.json()).error, "auth_rate_limited");

  const logout = await authLogout(
    new Request("https://api.example.test/logout", { method: "POST" }),
    noDb
  );
  assert.equal(logout.status, 200);
  assert.equal((await logout.clone().json()).logged_out, true);
  const setCookie = logout.headers.get("set-cookie");
  assert.match(setCookie, /^__Host-yorubay_session=/);
  assert.match(setCookie, /Max-Age=0/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);

  console.log("worker account auth core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
