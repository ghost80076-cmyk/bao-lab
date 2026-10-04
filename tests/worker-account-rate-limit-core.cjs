const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const rateLimitModuleSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/account-rate-limit.js"
  ),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/account-rate-limit\.js";/,
  "the Worker entry must import the extracted account rate limit module"
);
assert.doesNotMatch(
  workerEntrySource,
  /function authRateLimitConfigured\(/,
  "account rate limit implementation must not remain duplicated in worker.js"
);
assert.match(
  rateLimitModuleSource,
  /const WorkerAccountRateLimit = \(\(\) => \{/,
  "account rate limiting must stay behind WorkerAccountRateLimit"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAccountRateLimit, authRateLimitConfigured, authNetworkIdentity, authRateLimitKey, accountAuthAllowed, authRateLimited };";

const {
  WorkerAccountRateLimit,
  authRateLimitConfigured,
  authNetworkIdentity,
  authRateLimitKey,
  accountAuthAllowed,
  authRateLimited,
} = new Function(instrumented)();

assert.equal(WorkerAccountRateLimit.authRateLimitConfigured, authRateLimitConfigured);
assert.equal(WorkerAccountRateLimit.accountAuthAllowed, accountAuthAllowed);
assert.equal(authRateLimitConfigured({}), false);
assert.equal(
  authRateLimitConfigured({ AUTH_RATE_LIMITER: { limit() {} } }),
  true
);
assert.equal(
  authNetworkIdentity(new Request("https://api.example.test/auth", {
    headers: { "cf-connecting-ip": "203.0.113.7" },
  })),
  "network:203.0.113.7"
);
assert.equal(
  authNetworkIdentity(new Request("https://api.example.test/auth")),
  ""
);

(async () => {
  const key = await authRateLimitKey("login", "username:NightPilot");
  assert.match(key, /^yorubay-auth-v1:login:[a-f0-9]{64}$/);
  assert.doesNotMatch(key, /nightpilot/i);
  assert.equal(
    key,
    await authRateLimitKey("login", "username:nightpilot")
  );
  assert.notEqual(
    key,
    await authRateLimitKey("recover", "username:nightpilot")
  );

  assert.equal(await accountAuthAllowed({}, "login", ["username:a"]), true);

  const seen = [];
  const allowedEnv = {
    AUTH_RATE_LIMITER: {
      async limit(input) {
        seen.push(input.key);
        return { success: true };
      },
    },
  };
  assert.equal(
    await accountAuthAllowed(
      allowedEnv,
      "register",
      ["username:new-reader", "network:203.0.113.7", "username:new-reader", ""]
    ),
    true
  );
  assert.equal(seen.length, 2, "duplicate and empty identities must not consume counters");
  assert.ok(seen.every(value => !/new-reader|203\.0\.113\.7/.test(value)));

  assert.equal(
    await accountAuthAllowed(
      { AUTH_RATE_LIMITER: { async limit() { return { success: false }; } } },
      "login",
      ["username:reader"]
    ),
    false
  );

  const originalError = console.error;
  console.error = () => {};
  try {
    const broken = {
      AUTH_RATE_LIMITER: {
        async limit() {
          throw new Error("binding unavailable");
        },
      },
    };
    assert.equal(
      await accountAuthAllowed(broken, "login", ["username:reader"]),
      true,
      "binding errors fail open by default"
    );
    assert.equal(
      await accountAuthAllowed(
        { ...broken, AUTH_RATE_LIMIT_FAIL_CLOSED: "1" },
        "login",
        ["username:reader"]
      ),
      false,
      "operators can explicitly choose fail-closed behavior"
    );
  } finally {
    console.error = originalError;
  }

  const limited = authRateLimited();
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "auth_rate_limited" });

  console.log("worker account rate limit core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
