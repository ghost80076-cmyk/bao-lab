const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();

const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const selfRouteModuleSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/account-self-route.js"
  ),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/account-self-route\.js";/,
  "the Worker entry must import the extracted account self route module"
);
assert.doesNotMatch(
  workerEntrySource,
  /const WorkerAccountSelfRoute = \(\(\) => \{/,
  "account self route implementation must not remain duplicated in worker.js"
);
assert.match(
  selfRouteModuleSource,
  /const WorkerAccountSelfRoute = \(\(\) => \{/,
  "account self route implementation must live in its module"
);

assert.match(
  source,
  /const WorkerAccountSelfRoute = \(\(\) => \{/,
  "the authenticated account summary must stay behind WorkerAccountSelfRoute"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAccountSelfRoute, meRoute, COST_BILLING_MODE };";

const {
  WorkerAccountSelfRoute,
  meRoute,
  COST_BILLING_MODE,
} = new Function(instrumented)();

assert.equal(WorkerAccountSelfRoute.meRoute, meRoute);

(async () => {
  let unauthorizedDbCalls = 0;
  const unauthorized = await meRoute(
    new Request("https://api.example.test/me"),
    {},
    {
      prepare() {
        unauthorizedDbCalls += 1;
        throw new Error("unauthenticated requests should stop before the database");
      },
    }
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "unauthorized" });
  assert.equal(unauthorizedDbCalls, 0);

  const sessionToken = "yb_s_" + "a".repeat(30);
  const calls = [];
  const db = {
    prepare(sql) {
      const query = String(sql);
      const call = { query, args: [] };
      calls.push(call);
      return {
        bind(...args) {
          call.args = args;
          return this;
        },
        async first() {
          if (/FROM auth_sessions s/.test(query)) {
            return {
              id: "player-1",
              public_id: "YR-PLAYER-1",
              balance_microusd: 765,
              enabled: 1,
              wallet_balance_microusd: 2_500_000,
              wallet_currency: "USD",
              wallet_billing_mode: COST_BILLING_MODE,
              username: "nightpilot",
              display_name: "Night Pilot",
              expires_at: "2099-01-01T00:00:00.000Z",
            };
          }
          if (/FROM api_usage/.test(query)) return { n: 7 };
          throw new Error("unexpected query: " + query);
        },
      };
    },
  };

  const response = await meRoute(
    new Request("https://api.example.test/me", {
      headers: { authorization: "Bearer " + sessionToken },
    }),
    {},
    db
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    public_id: "YR-PLAYER-1",
    username: "nightpilot",
    display_name: "Night Pilot",
    auth_type: "session",
    billing_mode: COST_BILLING_MODE,
    legacy_balance_credits: 765,
    legacy_credit_unit: "100_tokens",
    wallet_balance_microusd: 2_500_000,
    wallet_balance_usd: 2.5,
    wallet_currency: "USD",
    daily_chat_limit: null,
    chat_used_today_utc: 7,
  });
  assert.match(
    response.headers.get("set-cookie") || "",
    new RegExp("^__Host-yorubay_session=" + sessionToken.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
  );
  assert.equal(calls.length, 2);
  assert.match(calls[1].query, /request_kind\s*=\s*'chat'/);
  assert.deepEqual(calls[1].args, ["player-1"]);

  console.log("worker account self route core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
