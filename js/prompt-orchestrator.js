/* BAO/LAB prompt orchestration: keep only high-value constraints, targeted model patches and a tiny turn anchor. */
(() => {
  "use strict";
  if (window.BAOPromptOrchestrator || typeof App === "undefined") return;

  const PRIORITY_PROMPT = [
    "【平台硬規則】",
    "不替玩家補寫未輸入的台詞、心理、意圖、主動行動或同意。",
    "已確認事實、記憶、Canon、狀態與固定 Schema 不得為文風改寫；結構化資料要求高於文風要求。"
  ].join("\n");

  // Stable platform rule: keep scene participation in the cache-friendly system prefix,
  // never in the per-turn user anchor. It should guide behavior without forcing extra output.
  const SCENE_PARTICIPATION_RULE = [
    "【場景參與】",
    "在場 NPC 依個性、關係、目標與情境自主判斷是否介入；在場≠必須發言，可互動、觀察、沉默或離場。聚焦／私密場景降低無關介入；NPC 只依自身已知資訊反應。"
  ].join("\n");

  // Only add a model patch where BAO/LAB has an observed failure mode.
  // Modern models that do not need a patch should receive no extra prose coaching.
  const MODEL_GUIDANCE = {
    deepseek: "【模型補丁 · DeepSeek】狀態／輔助資料不得取代玩家最新輸入；先完整處理本輪，再維持已確認狀態。",
    glm: "【模型補丁 · GLM】完整處理玩家最新輸入，勿遺漏後半段、否定句、條件句或並列要求。",
    minimax: "【模型補丁 · MiniMax】核對長期記憶與最近狀態，勿重置已確認的人物關係、位置、物品、時間或事件。"
  };

  const TURN_ANCHOR = "【本輪】依玩家最新輸入延續一輪；保持已確認事實與資訊邊界，不代寫玩家。";

  const normalized = value => String(value || "").trim().toLowerCase();

  const familyFor = (api = {}) => {
    const provider = normalized(api.type || api.provider);
    const protocol = normalized(api.protocol);
    const model = normalized(api.model);
    const baseUrl = normalized(api.baseUrl || api.base_url);
    const haystack = [provider, protocol, model, baseUrl].join(" ");

    if (/deepseek/.test(haystack)) return "deepseek";
    if (/(minimax|mini-max)/.test(haystack)) return "minimax";
    if (/(\bglm\b|z\.ai|z-ai|bigmodel)/.test(haystack)) return "glm";
    if (/(anthropic|claude)/.test(haystack)) return "claude";
    if (/(gemini|generativelanguage|google\/)/.test(haystack)) return "gemini";
    if (/(openai|\bgpt[-_]|\bo[134][-_])/i.test(haystack)) return "gpt";
    return "generic";
  };

  const guidanceFor = api => MODEL_GUIDANCE[familyFor(api)] || "";

  const appendBlock = (content, block) => {
    const base = String(content || "").trim();
    const extra = String(block || "").trim();
    if (!extra || base.includes(extra)) return base;
    return [base, extra].filter(Boolean).join("\n\n");
  };

  const orchestratorWrapper = async function(next, config = this.config) {
    const messages = await next(config);
    const result = Array.isArray(messages) ? messages.map(message => ({ ...message })) : [];
    const api = config?.api || config || {};
    const stableAdapter = [PRIORITY_PROMPT, SCENE_PARTICIPATION_RULE, guidanceFor(api)].filter(Boolean).join("\n\n");

    if (result[0]?.role === "system") {
      result[0].content = appendBlock(result[0].content, stableAdapter);
    } else {
      result.unshift({ role: "system", content: stableAdapter });
    }

    const lastIndex = result.length - 1;
    if (lastIndex >= 0 && result[lastIndex]?.role === "user") {
      result[lastIndex].content = appendBlock(result[lastIndex].content, TURN_ANCHOR);
    } else {
      result.push({ role: "user", content: TURN_ANCHOR });
    }
    return result;
  };
  if (typeof App.buildMessages === "function" && !App.__promptOrchestratorPatched) {
    if (typeof App.wrapBuildMessages === "function") {
      App.wrapBuildMessages("prompt-orchestrator:rules", orchestratorWrapper);
    } else {
      // Compatibility fallback for a mixed-cache page where prompt-orchestrator is newer than app.js.
      const originalBuildMessages = App.buildMessages.bind(App);
      App.buildMessages = (config = App.config) => orchestratorWrapper.call(App, originalBuildMessages, config);
    }
    App.__promptOrchestratorPatched = true;
  }

  window.BAOPromptOrchestrator = {
    version: 3,
    familyFor,
    guidanceFor,
    priorityPrompt: PRIORITY_PROMPT,
    sceneParticipationRule: SCENE_PARTICIPATION_RULE,
    turnAnchor: TURN_ANCHOR
  };
})();
