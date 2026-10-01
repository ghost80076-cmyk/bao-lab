(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOStoryStartReadinessCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const text = value => String(value ?? "").trim();

  function connection(input = {}) {
    const provider = text(input.provider || input.type).toLowerCase();
    const model = text(input.model);
    const baseUrl = text(input.baseUrl);
    const key = text(input.key);
    const local = input.local === true || provider === "lmstudio";
    const hosted = input.hosted === true || provider === "bao-credits";

    if (input.demoMode === true) {
      return {
        ready: true,
        mode: "demo",
        label: "離線體驗已準備",
        detail: "不會呼叫 AI；可以先進入介面體驗。",
        action: null
      };
    }

    if (hosted) {
      if (input.accountReady !== true) {
        return {
          ready: false,
          mode: "hosted",
          label: "還缺夜灣帳號登入",
          detail: "登入後即可使用夜灣燈火；不需要自己的連線金鑰。",
          action: "account"
        };
      }
      if (!model) {
        return {
          ready: false,
          mode: "hosted",
          label: "還沒選故事模型",
          detail: "選一個目前帳號額度可使用的模型。",
          action: "model"
        };
      }
      if (!baseUrl) {
        return {
          ready: false,
          mode: "hosted",
          label: "帳號連線仍在載入",
          detail: "夜灣 Hosted 連線網址尚未準備完成，請重新選一次模型。",
          action: "model"
        };
      }
      return {
        ready: true,
        mode: "hosted",
        label: "帳號 AI 設定完成",
        detail: model,
        action: null
      };
    }

    if (local) {
      if (!model) {
        return {
          ready: false,
          mode: "local",
          label: "還缺本機模型",
          detail: "先啟動 LM Studio Server，再讀取或手動選擇一個本機模型。",
          action: "local-model"
        };
      }
      if (!baseUrl) {
        return {
          ready: false,
          mode: "local",
          label: "還缺本機連線網址",
          detail: "確認 LM Studio Server 的本機 API 網址。",
          action: "endpoint"
        };
      }
      return {
        ready: true,
        mode: "local",
        label: "本地 AI 設定完成",
        detail: model,
        action: null
      };
    }

    if (!model) {
      return {
        ready: false,
        mode: "byok",
        label: "還沒選故事模型",
        detail: "先選擇要使用的模型。",
        action: "model"
      };
    }
    if (!baseUrl) {
      return {
        ready: false,
        mode: "byok",
        label: "還缺連線網址",
        detail: "目前服務需要補上 Base URL。",
        action: "endpoint"
      };
    }
    if (!key) {
      return {
        ready: false,
        mode: "byok",
        label: "還缺連線金鑰",
        detail: "貼上這個模型服務的連線金鑰後即可開始。",
        action: "key"
      };
    }
    return {
      ready: true,
      mode: "byok",
      label: "AI 設定完成",
      detail: model,
      action: null
    };
  }

  function evaluate(input = {}) {
    const workName = text(input.workName);
    const workReady = Boolean(input.workSelected && workName);
    const ai = connection(input.connection || {});
    const canStart = workReady && ai.ready;

    return {
      work: {
        ready: workReady,
        label: workReady ? "作品已選好" : "還沒有選作品",
        detail: workReady ? workName : "回到作品頁選擇想玩的故事。",
        action: workReady ? null : "work"
      },
      ai,
      start: {
        ready: canStart,
        label: canStart ? (ai.mode === "demo" ? "可以開始離線體驗" : "可以開始故事") : "尚未可以開始",
        detail: canStart ? "目前必要設定已完成。" : (!workReady ? "先選作品。" : ai.label),
        action: canStart ? null : (!workReady ? "work" : ai.action)
      },
      canStart,
      missing: !workReady ? "work" : (ai.ready ? "" : ai.action || "connection")
    };
  }

  return Object.freeze({ connection, evaluate });
});
