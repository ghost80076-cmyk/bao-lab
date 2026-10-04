const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const code = fs.readFileSync(
  path.join(__dirname, "../js/credits-pilot.js"),
  "utf8"
);
const registry = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../data/presets/models.json"),
    "utf8"
  )
);

function build(response) {
  const calls = [];
  const api = {
    __sendWrapperIds: new Set(),
    send: async () => ({ text: "BYOK", usage: {} }),
    contentToText: value => String(value),
    normalizeUsage: usage => usage,
    networkError: error => error,
    wrapSend(id, wrapper) {
      const next = this.send.bind(this);
      this.send = (config, messages, ...rest) =>
        wrapper(next, config, messages, ...rest);
      this.__sendWrapperIds.add(id);
      return true;
    }
  };
  const app = {
    config: { api: null },
    modelRegistry: registry,
    modelPresets: [],
    populateAPIControls() {},
    syncSelectedPreset() {}
  };
  const elements = {
    "api-type": {
      value: "",
      querySelector: () => null,
      appendChild() {},
      addEventListener() {}
    },
    "api-key": {
      value: "",
      closest: () => ({ firstChild: { nodeType: 3 } }),
      addEventListener() {}
    },
    "api-hint": { textContent: "" },
    "api-protocol-badge": { textContent: "" }
  };
  const document = {
    readyState: "loading",
    getElementById: id => elements[id],
    createElement: () => ({}),
    addEventListener() {},
    body: {}
  };
  const window = {
    localStorage: {
      getItem: key =>
        key === "yorubay:session:active" ? "1" : null
    },
    GameState: {
      current: {
        storySessionId:
          "bao-lab:test-story:413-diagnostics"
      }
    }
  };
  const context = {
    API: api,
    App: app,
    document,
    window,
    TextEncoder,
    MutationObserver: class { observe() {} },
    fetch: async (url, options) => {
      calls.push([url, options]);
      return {
        ok: response.ok,
        status: response.status,
        json: async () => response.body
      };
    }
  };
  vm.runInNewContext(code, context);
  return { api, calls };
}

const config = {
  type: "bao-credits",
  route: "bao-credits",
  protocol: "openai",
  baseUrl: "https://api.yorubay.com/chat",
  key: "__YORUBAY_ACCOUNT__",
  model: "anthropic/claude-sonnet-4.6"
};
const messages = [{ role: "user", content: "hello" }];

test("relay 413 names the relay and reports payload size", async () => {
  const state = build({
    ok: false,
    status: 502,
    body: {
      error: "relay_request_too_large",
      upstream_http_status: 413,
      route: "aws_relay",
      request_bytes: 92160,
      request_id: "11111111-1111-4111-8111-111111111111"
    }
  });

  await assert.rejects(
    () => state.api.send(config, messages),
    error => {
      assert.match(
        error.message,
        /夜灣 AWS 中繼拒絕了這個過大的請求/
      );
      assert.match(error.message, /不是內容審查/);
      assert.match(error.message, /路徑：夜灣 AWS 中繼/);
      assert.match(error.message, /送出大小：約 90\.0 KB/);
      assert.match(error.message, /診斷編號/);
      assert.doesNotMatch(
        error.message,
        /OpenRouter 拒絕本次請求/
      );
      return true;
    }
  );
});

test("direct OpenRouter 413 is not mislabeled as relay failure", async () => {
  const state = build({
    ok: false,
    status: 502,
    body: {
      error: "provider_request_too_large",
      upstream_http_status: 413,
      route: "direct_openrouter",
      request_bytes: 102400,
      request_id: "22222222-2222-4222-8222-222222222222"
    }
  });

  await assert.rejects(
    () => state.api.send(config, messages),
    error => {
      assert.match(
        error.message,
        /OpenRouter 拒絕了這個過大的請求/
      );
      assert.match(error.message, /不是內容審查/);
      assert.match(error.message, /路徑：OpenRouter 直連/);
      assert.match(error.message, /送出大小：約 100\.0 KB/);
      assert.match(error.message, /診斷編號/);
      return true;
    }
  );
});
