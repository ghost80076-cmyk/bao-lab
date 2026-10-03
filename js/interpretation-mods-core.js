(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOInterpretationModsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const VERSION = 1;
  const MAX_OUTPUTS = 120;
  const STAGES = new Set(["pre_response_advisor", "post_response_observer"]);
  const text = value => String(value ?? "").trim();
  const unique = list => [...new Set((Array.isArray(list) ? list : []).map(text).filter(Boolean))];

  function sanitizeCatalog(input = []) {
    const seen = new Set();
    return (Array.isArray(input) ? input : []).map(item => {
      const id = text(item?.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      const stage = text(item?.stage);
      if (!id || seen.has(id) || !STAGES.has(stage)) return null;
      seen.add(id);
      return {
        id,
        label: text(item?.label || id).slice(0, 80),
        icon: text(item?.icon || "◈").slice(0, 8),
        badge: text(item?.badge).slice(0, 48),
        stage,
        description: text(item?.description).slice(0, 280),
        prompt: text(item?.prompt).slice(0, 8000)
      };
    }).filter(Boolean);
  }

  function normalizeState(input = {}) {
    const raw = input && typeof input === "object" ? input : {};
    const outputs = (Array.isArray(raw.outputs) ? raw.outputs : []).slice(-MAX_OUTPUTS).map(item => ({
      messageId: text(item?.messageId).slice(0, 120),
      playerMessageId: text(item?.playerMessageId).slice(0, 120),
      advisor: text(item?.advisor).slice(0, 8000),
      observer: text(item?.observer).slice(0, 8000),
      createdAt: text(item?.createdAt).slice(0, 40)
    })).filter(item => item.messageId && (item.advisor || item.observer));

    return {
      version: VERSION,
      enabled: unique(raw.enabled).slice(0, 12),
      detailMode: raw.detailMode === "detailed" ? "detailed" : "compact",
      monitorTone: raw.monitorTone === "banter" ? "banter" : "professional",
      showAdvisor: raw.showAdvisor !== false,
      outputs
    };
  }

  function activeMods(state = {}, catalog = []) {
    const normalized = normalizeState(state);
    const enabled = new Set(normalized.enabled);
    return sanitizeCatalog(catalog).filter(item => enabled.has(item.id));
  }

  function activeForStage(state = {}, catalog = [], stage = "") {
    return activeMods(state, catalog).filter(item => item.stage === stage);
  }

  function toggle(state = {}, id = "", enabled) {
    const normalized = normalizeState(state);
    const key = text(id);
    if (!key) return normalized;
    const set = new Set(normalized.enabled);
    const next = enabled === undefined ? !set.has(key) : enabled === true;
    if (next) set.add(key);
    else set.delete(key);
    return { ...normalized, enabled: [...set] };
  }

  function command(value, catalog = []) {
    const raw = text(value);
    const ids = new Set(sanitizeCatalog(catalog).map(item => item.id));
    const advisor = ids.has("bun-interpreter") ? "bun-interpreter" : "";
    const observer = ids.has("class-monitor") ? "class-monitor" : "";
    const both = [advisor, observer].filter(Boolean);

    if (advisor && ["【啟用肉包】","【啟用肉包模組】","【開啟肉包】"].includes(raw)) {
      return { mode: "add", enabled: [advisor] };
    }
    if (advisor && ["【關閉肉包】","【停用肉包】","【關閉肉包模組】"].includes(raw)) {
      return { mode: "remove", enabled: [advisor] };
    }
    if (observer && ["【啟用班長】","【啟用班長模組】","【開啟班長】"].includes(raw)) {
      return { mode: "add", enabled: [observer] };
    }
    if (observer && ["【關閉班長】","【停用班長】","【關閉班長模組】"].includes(raw)) {
      return { mode: "remove", enabled: [observer] };
    }
    if (both.length === 2 && ["【啟用雙系統】","【啟用班長和肉包】","【開啟雙系統】"].includes(raw)) {
      return { mode: "replace-group", group: both, enabled: both };
    }
    if (both.length && ["【關閉雙系統】","【停用雙系統】"].includes(raw)) {
      return { mode: "replace-group", group: both, enabled: [] };
    }
    if (raw === "【班長切換吐槽模式】") return { mode: "setting", key: "monitorTone", value: "banter" };
    if (raw === "【班長切換專業模式】") return { mode: "setting", key: "monitorTone", value: "professional" };
    if (["【解讀簡潔模式】","【解讀精簡模式】"].includes(raw)) return { mode: "setting", key: "detailMode", value: "compact" };
    if (["【解讀詳細模式】","【解讀完整模式】"].includes(raw)) return { mode: "setting", key: "detailMode", value: "detailed" };
    return null;
  }

  function applyCommand(state = {}, action = null) {
    const normalized = normalizeState(state);
    if (!action) return normalized;
    if (action.mode === "setting") {
      if (action.key === "monitorTone") return { ...normalized, monitorTone: action.value === "banter" ? "banter" : "professional" };
      if (action.key === "detailMode") return { ...normalized, detailMode: action.value === "detailed" ? "detailed" : "compact" };
      return normalized;
    }

    const set = new Set(normalized.enabled);
    if (action.mode === "remove") unique(action.enabled).forEach(id => set.delete(id));
    else if (action.mode === "replace-group") {
      unique(action.group).forEach(id => set.delete(id));
      unique(action.enabled).forEach(id => set.add(id));
    } else {
      unique(action.enabled).forEach(id => set.add(id));
    }
    return { ...normalized, enabled: [...set] };
  }

  function addOutput(state = {}, output = {}) {
    const normalized = normalizeState(state);
    const next = {
      messageId: text(output.messageId).slice(0, 120),
      playerMessageId: text(output.playerMessageId).slice(0, 120),
      advisor: text(output.advisor).slice(0, 8000),
      observer: text(output.observer).slice(0, 8000),
      createdAt: text(output.createdAt || new Date().toISOString()).slice(0, 40)
    };
    if (!next.messageId || (!next.advisor && !next.observer)) return normalized;
    const outputs = normalized.outputs.filter(item => item.messageId !== next.messageId);
    outputs.push(next);
    return { ...normalized, outputs: outputs.slice(-MAX_OUTPUTS) };
  }

  function outputFor(state = {}, messageId = "") {
    const key = text(messageId);
    if (!key) return null;
    return normalizeState(state).outputs.find(item => item.messageId === key) || null;
  }

  function lengthRule(mode) {
    return mode === "detailed"
      ? "每一欄 2–3 句；總長約 220–420 個中文字。"
      : "保持精簡：每一欄 1 句，總長約 80–180 個中文字。";
  }

  function buildAdvisorMessages({ mods = [], playerText = "", previousScene = "", detailMode = "compact" } = {}) {
    const active = sanitizeCatalog(mods).filter(item => item.stage === "pre_response_advisor");
    const player = text(playerText);
    if (!active.length || !player) return [];
    const system = [
      "你是故事生成前的「玩家行為解讀顧問」。你的輸出是一份可選參考摘要，不是玩家的真實內心，也不是故事事實。",
      "只根據玩家本輪實際輸入與上一輪玩家可見正文分析；不得使用隱藏狀態、不得替玩家補心理、不得把模糊行為解讀成明確同意、戀愛或敵意。",
      "主故事模型必須優先遵守玩家明示內容、角色設定、既有關係、已發生事實與資訊邊界；你的建議永遠不能覆蓋這些內容。",
      "不得替 NPC 寫出台詞或動作成品；只提供『可能意圖／可觀察情緒／NPC 可能感受到什麼／反應注意事項』。",
      "使用『可能、看起來、較像、目前不足以判斷』等不確定語言；資訊不足時直接說不足。",
      lengthRule(detailMode),
      ...active.map(mod => `【${mod.label}】\n${mod.prompt}`)
    ].join("\n\n");
    const user = [
      previousScene ? `【上一輪玩家可見正文】\n${text(previousScene).slice(0, 6000)}` : "",
      `【玩家本輪輸入】\n${player.slice(0, 3000)}`
    ].filter(Boolean).join("\n\n");
    return [{ role: "system", content: system }, { role: "user", content: user }];
  }

  function advisorContext(content = "") {
    const summary = text(content);
    if (!summary) return "";
    return [
      "【肉包顧問摘要｜可選解讀，不是玩家內心事實】",
      summary.slice(0, 6000),
      "只把以上內容當作低優先級參考。不得據此讓 NPC 讀心；如與角色設定、已發生事實、關係進度或玩家明示內容衝突，忽略這份摘要。"
    ].join("\n");
  }

  function buildObserverMessages({ mods = [], playerText = "", sceneText = "", detailMode = "compact", monitorTone = "professional" } = {}) {
    const active = sanitizeCatalog(mods).filter(item => item.stage === "post_response_observer");
    const scene = text(sceneText);
    if (!active.length || !scene) return [];
    const tone = monitorTone === "banter"
      ? "班長可使用輕鬆吐槽口吻，但不可把不確定訊號說成定論，也不可用性別刻板印象。"
      : "班長使用冷靜、客觀、易懂的專業口吻。";
    const system = [
      "你是故事正文之外的「NPC 表現解讀者」。只分析玩家本輪看得到的正文，不改正文、不續寫劇情、不寫入角色記憶或世界狀態。",
      "分析目標是『敘事線索怎麼讀』，不是測謊。禁止使用『眼睛往左／右代表回憶或編造』『撥頭髮代表喜歡』『單一瞳孔或姿勢可證明真實心理』等不可靠規則作為定論。",
      "只引用正文真正出現的表情、動作、距離、語氣、用詞與前後文；沒有描寫就明確說沒有足夠線索。",
      "可以提出多種可能解讀，但不得宣稱知道 NPC 未說出口的真實心理、不得判定 100% 說謊或喜歡、不得透露玩家看不到的資訊、不得預測未來。",
      "若提供下一步建議，保持低壓力、尊重界線與既有關係；不要把肢體接觸、表白或親吻當成必然正解。",
      tone,
      lengthRule(detailMode),
      ...active.map(mod => `【${mod.label}】\n${mod.prompt}`)
    ].join("\n\n");
    const user = [
      playerText ? `【玩家本輪輸入（只作上下文）】\n${text(playerText).slice(0, 3000)}` : "",
      `【本輪故事正文】\n${scene.slice(0, 12000)}`
    ].filter(Boolean).join("\n\n");
    return [{ role: "system", content: system }, { role: "user", content: user }];
  }

  return Object.freeze({
    VERSION,
    MAX_OUTPUTS,
    sanitizeCatalog,
    normalizeState,
    activeMods,
    activeForStage,
    toggle,
    command,
    applyCommand,
    addOutput,
    outputFor,
    buildAdvisorMessages,
    advisorContext,
    buildObserverMessages
  });
});
