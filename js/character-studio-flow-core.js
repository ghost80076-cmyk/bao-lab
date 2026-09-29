(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOCharacterStudioFlowCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const text = value => String(value ?? "").trim();
  const validId = value => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(text(value));

  const STEPS = Object.freeze([
    { id: "basic", label: "基本資料", short: "基本" },
    { id: "core", label: "角色／世界核心", short: "核心" },
    { id: "opening", label: "故事開場", short: "開場" },
    { id: "world", label: "人物與世界", short: "世界" },
    { id: "appearance", label: "互動 UI", short: "外觀" },
    { id: "finish", label: "預覽與完成", short: "完成" }
  ]);

  function requiredProgress(values = {}) {
    const checks = {
      name: Boolean(text(values.name)),
      id: validId(values.id),
      system_prompt: Boolean(text(values.system_prompt)),
      greeting: Boolean(text(values.greeting))
    };
    const done = Object.values(checks).filter(Boolean).length;
    return { done, total: 4, complete: done === 4, checks };
  }

  function optionalFilled(values = {}) {
    return ["profile", "world", "lore", "npc_rules", "author_instructions", "creator_notes", "quote"]
      .some(key => Boolean(text(values[key])));
  }

  function stepStates(values = {}, options = {}) {
    const required = requiredProgress(values);
    const basicDone = required.checks.name && required.checks.id;
    const worldDone = optionalFilled(values);
    return {
      basic: {
        state: basicDone ? "complete" : "required",
        label: basicDone ? "完成" : (Number(required.checks.name) + Number(required.checks.id)) + "/2"
      },
      core: {
        state: required.checks.system_prompt ? "complete" : "required",
        label: required.checks.system_prompt ? "完成" : "必填"
      },
      opening: {
        state: required.checks.greeting ? "complete" : "required",
        label: required.checks.greeting ? "完成" : "必填"
      },
      world: {
        state: worldDone ? "complete" : "optional",
        label: worldDone ? "已填寫" : "選填"
      },
      appearance: {
        state: options.gameplayEnabled ? "available" : "optional",
        label: options.gameplayEnabled ? "可調整" : "選填"
      },
      finish: {
        state: required.complete ? "ready" : "required",
        label: required.complete ? "可預覽" : "差 " + (required.total - required.done) + " 項"
      }
    };
  }

  function overallLabel(values = {}) {
    const progress = requiredProgress(values);
    return progress.complete
      ? "必填 4/4 · 可以預覽與試玩"
      : "必填 " + progress.done + "/" + progress.total + " · 還有 " + (progress.total - progress.done) + " 項";
  }

  return Object.freeze({ STEPS, validId, requiredProgress, optionalFilled, stepStates, overallLabel });
});
