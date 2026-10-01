const assert = require("node:assert/strict");
const core = require("../js/story-start-readiness-core.js");

{
  const state = core.evaluate({
    workSelected: true,
    workName: "林沉風",
    connection: {
      provider: "gemini",
      model: "gemini-3.1-pro-preview",
      baseUrl: "https://generativelanguage.googleapis.com",
      key: ""
    }
  });
  assert.equal(state.work.ready, true);
  assert.equal(state.ai.ready, false);
  assert.equal(state.ai.action, "key");
  assert.match(state.ai.label, /連線金鑰/);
  assert.equal(state.canStart, false);
  assert.equal(state.missing, "key");
}

{
  const state = core.evaluate({
    workSelected: true,
    workName: "林沉風",
    connection: {
      provider: "openrouter",
      model: "google/gemini-3.1-pro-preview",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      key: "not-exported-test-key"
    }
  });
  assert.equal(state.ai.ready, true);
  assert.equal(state.ai.mode, "byok");
  assert.equal(state.canStart, true);
  assert.equal(state.start.label, "可以開始故事");
}

{
  const missing = core.evaluate({
    workSelected: true,
    workName: "林沉風",
    connection: {
      provider: "bao-credits",
      hosted: true,
      accountReady: false,
      model: "gemini-3.1-pro-preview",
      baseUrl: "https://api.yorubay.com/chat"
    }
  });
  assert.equal(missing.ai.ready, false);
  assert.equal(missing.ai.action, "account");
  assert.match(missing.ai.label, /帳號/);

  const ready = core.evaluate({
    workSelected: true,
    workName: "林沉風",
    connection: {
      provider: "bao-credits",
      hosted: true,
      accountReady: true,
      model: "gemini-3.1-pro-preview",
      baseUrl: "https://api.yorubay.com/chat"
    }
  });
  assert.equal(ready.ai.ready, true);
  assert.equal(ready.ai.mode, "hosted");
  assert.equal(ready.canStart, true);
}

{
  const missing = core.evaluate({
    workSelected: true,
    workName: "本地故事",
    connection: {
      provider: "lmstudio",
      local: true,
      baseUrl: "http://127.0.0.1:1234/v1/chat/completions",
      model: "",
      key: ""
    }
  });
  assert.equal(missing.ai.ready, false);
  assert.equal(missing.ai.action, "local-model");

  const ready = core.evaluate({
    workSelected: true,
    workName: "本地故事",
    connection: {
      provider: "lmstudio",
      local: true,
      baseUrl: "http://127.0.0.1:1234/v1/chat/completions",
      model: "gemma4-26b-a4b",
      key: ""
    }
  });
  assert.equal(ready.ai.ready, true, "LM Studio must not require a cloud API key");
  assert.equal(ready.canStart, true);
}

{
  const demo = core.evaluate({
    workSelected: true,
    workName: "離線預覽",
    connection: { demoMode: true }
  });
  assert.equal(demo.ai.ready, true);
  assert.equal(demo.ai.mode, "demo");
  assert.equal(demo.start.label, "可以開始離線體驗");
}

{
  const missingWork = core.evaluate({
    workSelected: false,
    workName: "",
    connection: {
      provider: "gemini",
      model: "gemini-3-flash-preview",
      baseUrl: "https://example.invalid",
      key: "x"
    }
  });
  assert.equal(missingWork.work.ready, false);
  assert.equal(missingWork.canStart, false);
  assert.equal(missingWork.missing, "work");
}

console.log("story start readiness core test passed");
