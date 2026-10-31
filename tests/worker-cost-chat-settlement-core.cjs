const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/modules/cost-chat-settlement.js"
);
const source = fs.readFileSync(modulePath, "utf8");

assert.match(
  source,
  /const WorkerCostChatSettlement = \(\(\) => \{/,
  "USD wallet reservation and settlement must stay grouped behind WorkerCostChatSettlement"
);

assert.match(
  source,
  /refundReservation\("unverified_refunded"/,
  "ambiguous provider usage must be recorded as refunded rather than left held"
);

assert.match(
  source,
  /billing_refunded:\s*true/,
  "ambiguous transport failures must tell the client that the reservation was refunded"
);

assert.match(
  source,
  /settlement_status:\s*"unverified_refunded"/,
  "successful content with unverifiable usage must be delivered as a refunded fallback"
);

const pricedEnv = {
  MODELS_JSON: JSON.stringify([
    {
      provider: "test-provider",
      model: "test-model",
      input_microusd_per_million: 100000,
      output_microusd_per_million: 200000,
    },
  ]),
};

const enabledPlayer = {
  id: "player-wallet-test",
  enabled: 1,
  wallet_enabled: 1,
  wallet_balance_microusd: 1000000,
};

const requestBody = {
  provider: "test-provider",
  model: "test-model",
  messages: [{ role: "user", content: "hello" }],
};

const request = () =>
  new Request("https://worker.test/v1/chat", { method: "POST" });

const errorCode = async response => (await response.json()).error;

(async () => {
  const {
    WorkerCostChatSettlement,
    costUsdChatRoute,
  } = await import(pathToFileURL(modulePath).href);

  assert.equal(
    WorkerCostChatSettlement.costUsdChatRoute,
    costUsdChatRoute,
    "the public compatibility alias must point at the isolated USD settlement route"
  );

  const disabled = await costUsdChatRoute(
    request(),
    pricedEnv,
    {},
    { ...enabledPlayer, wallet_enabled: 0 },
    requestBody
  );

  assert.equal(disabled.status, 403);
  assert.equal(await errorCode(disabled), "wallet_disabled");

  const invalidSession = await costUsdChatRoute(
    request(),
    pricedEnv,
    {},
    enabledPlayer,
    { ...requestBody, session_id: { invalid: true } }
  );

  assert.equal(invalidSession.status, 400);
  assert.equal(await errorCode(invalidSession), "invalid_session_id");

  const invalidOutput = await costUsdChatRoute(
    request(),
    pricedEnv,
    {},
    enabledPlayer,
    { ...requestBody, max_output_tokens: 0 }
  );

  assert.equal(invalidOutput.status, 400);
  assert.equal(await errorCode(invalidOutput), "invalid_max_output_tokens");

  const unpricedEnv = {
    MODELS_JSON: JSON.stringify([
      {
        provider: "test-provider",
        model: "test-model",
      },
    ]),
  };

  const unpriced = await costUsdChatRoute(
    request(),
    unpricedEnv,
    {},
    enabledPlayer,
    requestBody
  );

  assert.equal(unpriced.status, 503);
  assert.equal(await errorCode(unpriced), "pricing_not_configured");

  const geminiEnv = {MODELS_JSON:JSON.stringify([{provider:'gemini',model:'gemini-3.1-pro-preview',input_microusd_per_million:100000,output_microusd_per_million:200000}])};
  let balance=500, usageWrites=0, fetches=0;
  const budgetDb={
    prepare(sql){
      const q={bind(){return q;},async all(){return {results:[]};},async first(){return {balance_microusd:balance};},async run(){
        if(sql.includes('INSERT INTO api_usage')){usageWrites++;throw new Error('REACHED_RESERVATION');}
        return {meta:{changes:0}};
      }};return q;
    },async batch(queries){return Promise.all(queries.map(q=>q.run()));}
  };
  const geminiBody={provider:'gemini',model:'gemini-3.1-pro-preview',messages:requestBody.messages,request_kind:'summary',max_output_tokens:16384};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{fetches++;throw new Error('unexpected provider call');};
  try {
    const short=await costUsdChatRoute(request(),geminiEnv,budgetDb,enabledPlayer,geminiBody);
    const detail=await short.json();
    assert.equal(short.status,402);
    assert.equal(detail.error,'insufficient_wallet_balance_for_summary');
    assert.equal(detail.model_called,false);
    assert.equal(detail.requested_max_output_tokens,16384);
    assert.ok(detail.effective_max_output_tokens<16384);
    assert.equal(usageWrites,0,'denied summary must not create a paid request');
    assert.equal(fetches,0,'denied summary must not reach the model');
    const overChat=await costUsdChatRoute(request(),geminiEnv,budgetDb,enabledPlayer,{...geminiBody,request_kind:'chat'});
    assert.equal(overChat.status,400,'normal story cap remains 8192');
    await assert.rejects(()=>costUsdChatRoute(request(),geminiEnv,budgetDb,enabledPlayer,{...geminiBody,request_kind:'chat',max_output_tokens:8192}),/REACHED_RESERVATION/,'ordinary chat retains its partial-affordability policy');
    balance=100000;
    await assert.rejects(()=>costUsdChatRoute(request(),geminiEnv,budgetDb,enabledPlayer,geminiBody),/REACHED_RESERVATION/,'fully funded 16K Gemini summary passes validation');
  } finally {globalThis.fetch=originalFetch;}

  console.log("worker USD chat settlement core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
