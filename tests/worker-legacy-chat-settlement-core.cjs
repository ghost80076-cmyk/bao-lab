const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/modules/legacy-chat-settlement.js"
);
const source = fs.readFileSync(modulePath, "utf8");

assert.match(
  source,
  /const WorkerLegacyChatSettlement = \(\(\) => \{/,
  "legacy chat reservation and settlement must stay grouped behind WorkerLegacyChatSettlement"
);

const env = {
  MODELS_JSON: JSON.stringify([
    {
      provider: "test-provider",
      model: "test-model",
      input_microusd_per_million: 1,
      output_microusd_per_million: 1,
    },
  ]),
};

const player = {
  id: "player-legacy-test",
  enabled: 1,
};

const requestBody = {
  provider: "test-provider",
  model: "test-model",
  messages: [{ role: "user", content: "hello" }],
};

const errorCode = async response => (await response.json()).error;

(async () => {
  const {
    WorkerLegacyChatSettlement,
    legacyChatRoute,
  } = await import(pathToFileURL(modulePath).href);

  assert.equal(
    WorkerLegacyChatSettlement.legacyChatRoute,
    legacyChatRoute,
    "the public compatibility alias must point at the isolated legacy settlement route"
  );

  const invalidSession = await legacyChatRoute(
    new Request("https://worker.test/v1/chat", { method: "POST" }),
    env,
    {},
    player,
    { ...requestBody, session_id: { invalid: true } }
  );

  assert.equal(invalidSession.status, 400);
  assert.equal(await errorCode(invalidSession), "invalid_session_id");

  const invalidOutput = await legacyChatRoute(
    new Request("https://worker.test/v1/chat", { method: "POST" }),
    env,
    {},
    player,
    { ...requestBody, max_output_tokens: 0 }
  );

  assert.equal(invalidOutput.status, 400);
  assert.equal(await errorCode(invalidOutput), "invalid_max_output_tokens");

  let preparedStatements = 0;
  const deniedDb = {
    async batch(statements) {
      assert.equal(statements.length, 2);
      return [
        { meta: { changes: 0 } },
        { meta: { changes: 0 } },
      ];
    },
    prepare() {
      preparedStatements += 1;
      return {
        bind() {
          return {};
        },
      };
    },
  };

  const insufficient = await legacyChatRoute(
    new Request("https://worker.test/v1/chat", { method: "POST" }),
    env,
    deniedDb,
    player,
    requestBody
  );

  assert.equal(insufficient.status, 402);
  assert.equal(await errorCode(insufficient), "insufficient_credits");
  assert.equal(
    preparedStatements,
    2,
    "reservation denial must stop before provider transport or settlement follow-up SQL"
  );

  const geminiEnv={MODELS_JSON:JSON.stringify([{provider:'gemini',model:'gemini-3.1-pro-preview'}])};
  const geminiSummary={provider:'gemini',model:'gemini-3.1-pro-preview',request_kind:'summary',max_output_tokens:16384,messages:requestBody.messages};
  const fullSummaryDenied=await legacyChatRoute(new Request('https://worker.test/v1/chat',{method:'POST'}),geminiEnv,deniedDb,player,geminiSummary);
  assert.equal(fullSummaryDenied.status,402,'16K Gemini summary reaches the legacy full-reserve check');
  assert.equal(await errorCode(fullSummaryDenied),'insufficient_credits');
  const chatOverCap=await legacyChatRoute(new Request('https://worker.test/v1/chat',{method:'POST'}),geminiEnv,{},player,{...geminiSummary,request_kind:'chat'});
  assert.equal(chatOverCap.status,400,'legacy story output remains capped at 8192');
  const routedEnv={MODELS_JSON:JSON.stringify([
    {provider:'gemini',model:'gemini-3.1-pro-preview'},
    {provider:'openrouter',model:'google/gemini-3.1-pro-preview'}
  ])};
  const routedDb={...deniedDb,prepare(sql){
    if(sql.includes('hosted_route_overrides')) return {bind(){return {async first(){return {route_id:'openrouter'};}};}};
    return deniedDb.prepare(sql);
  }};
  const routed=await legacyChatRoute(new Request('https://worker.test/v1/chat',{method:'POST'}),routedEnv,routedDb,player,geminiSummary);
  assert.equal(await errorCode(routed),'insufficient_credits','16K logical summary reaches capped OpenRouter reservation');
  console.log("worker legacy chat settlement core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
