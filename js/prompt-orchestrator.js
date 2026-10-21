/* BAO/LAB prompt orchestration: keep only high-value constraints, targeted model patches and a tiny turn anchor. */
(() => {
  "use strict";
  if (window.BAOPromptOrchestrator || typeof App === "undefined") return;

  const PRIORITY_PROMPT = [
    "【平台硬規則】",
    "不替玩家補寫未輸入的台詞、心理、意圖、主動行動或同意。",
    "已確認事實、記憶、Canon、狀態與固定 Schema 不得為文風改寫；結構化資料要求高於文風要求。"
  ].join("\n");

  const PLAYER_AGENCY_RULE = [
    "【玩家自主權】",
    "對話選項與行動建議只能提出玩家自身可選的行動，不得代玩家決定 NPC 的意志、行動或結果。",
    "可延續玩家明示行動並補足合理感官、環境及細微動作；不得擴張玩家意圖、代作重大承諾或不可逆的主動決策。",
    "NPC 與世界仍依因果自主反應，合理後果不等於替玩家決定。"
  ].join("\n");

  // Stable platform rule: keep scene participation in the cache-friendly system prefix,
  // never in the per-turn user anchor. It should guide behavior without forcing extra output.
  const SCENE_PARTICIPATION_RULE = [
    "【場景參與】",
    "在場 NPC 依個性、關係、目標與情境自主判斷是否介入；在場≠必須發言，可互動、觀察、沉默或離場。聚焦／私密場景降低無關介入；NPC 只依自身已知資訊反應。"
  ].join("\n");

  // Shared dialogue behavior. This is stable scene guidance, not a substitute for the character's own voice.
  const DIALOGUE_REALISM_RULE = [
    "【人物對話真實性】",
    "場景旁白可以具有電影感，但人物台詞由其自身性格、年齡、生活背景、語言習慣、當下目的與關係決定；不可將所有人物統一寫成精緻、溫柔或心理諮商式口吻。",
    "符合人設時可有短句、口語、省略、打岔、吐槽、答非所問、遲疑或沉默；不必每輪先寫眼神停頓再接金句，不必每輪解釋情緒、總結道理或用問題收尾；也不可把這些口語特徵機械套用到所有人物。",
    "NPC 有自己的當下目的與生活安排，可以主動提議、邀約、追問、拒絕、犯錯或處理自己的事；保留玩家的回應與選擇空間，但不將尊重玩家自主權誤解為 NPC 必須等指令才行動。"
  ].join("\n");

  // Tracker data is a delayed snapshot, not a command to replay the opening.
  // Keep this rule stable so changing scenes does not invalidate the cached prefix.
  const STATE_CONTINUITY_RULE = [
    "【狀態時序】",
    "人物／世界狀態是上次整理的快照，可能落後於對話。較新的已確認事件優先於舊位置、行動與開場；延續玩家本輪明示的合理行動，勿用舊快照將場景倒退或重問已完成的選擇。",
    "願望、假設、否定、引述及尚待判定的嘗試不算完成；仍依世界規則與因果判定結果，不自動移動 NPC，不改寫固定人設或資訊邊界。"
  ].join("\n");

  // Yume-only compatibility rule: also applies to old saved character snapshots.
  // Keep it in the stable system prefix, not the per-turn anchor or UI cleanup.
  const YUME_OUTPUT_RULE = [
    "【黑羽ゆめ｜語言與場景】",
    "場景旁白、人物動作及環境描述使用自然繁體中文；保留日文人名及日本專有詞。日語角色可說日文，但應緊接繁中譯文，不能將整段旁白改成日文。",
    "只輸出可閱讀的敘事與台詞；不要模仿舊回覆中的 CHAR 角色標籤、NARRATION 段落標籤或其結尾標籤。",
    "玩家已進便利店且未離開時，場景就在店內；不得因舊開場再次邀請進店或重問帶傘。依最新行動與已確認事件續寫，不擅自讓其他 NPC 跟著進店。"
  ].join("\n");

  // Only add a model patch where BAO/LAB has an observed failure mode.
  // Modern models that do not need a patch should receive no extra prose coaching.
  const MODEL_GUIDANCE = {
    deepseek: "【模型補丁 · DeepSeek】狀態／輔助資料不得取代玩家最新輸入；先完整處理本輪，再維持已確認狀態。",
    glm: "【模型補丁 · GLM】完整處理玩家最新輸入，勿遺漏後半段、否定句、條件句或並列要求。",
    minimax: "【模型補丁 · MiniMax】核對長期記憶與最近狀態，勿重置已確認的人物關係、位置、物品、時間或事件。"
  };

  const TURN_ANCHOR = "【本輪】依玩家最新輸入延續一輪；保持已確認事實與資訊邊界，不代寫玩家。";

  // The raw chat is local and is not deleted by context trimming. When a long
  // story's state tracker falls behind, bring back a small, verbatim slice of
  // its newest turns. No model call, new persistent memory, or interpretation.
  const recentContinuityEvidence = (requestMessages = []) => {
    const state = window.GameState?.current;
    const chat = window.Chat;
    if (!state || !Array.isArray(chat?.messages)) return "";
    const phase = state.stateTracker?.phase;
    const pending = Array.isArray(state.pendingStateTurns) && state.pendingStateTurns.length > 0;
    const rounds = typeof chat.turnCount === "function" ? chat.turnCount() :
      chat.messages.filter(m => m?.role === "user").length;
    // A provider can reply with {} even when a scene changed. In very long
    // stories, "unchanged" therefore needs a smaller fallback evidence slice.
    const stale = phase === "failed" || pending || (rounds >= 30 && phase === "unchanged");
    if (!stale || rounds < 20) return "";
    // Latest input is already sent separately. Include only completed recent
    // turns, with a fixed small budget to protect token cost and cache prefix.
    const source = chat.messages.filter(m => m && (m.role === "user" || m.role === "assistant"));
    if (source.at(-1)?.role === "user") source.pop();
    // In fixed-round/pressure modes, the model may have lost a recent scene
    // while the status tracker still points at an older place. Compare against
    // the REAL assembled request, not a guessed context window: replaying turns
    // already sent wastes tokens and cannot fix a missing scene.
    const sent = (Array.isArray(requestMessages) ? requestMessages : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: String(m.content || "").trim() }));
    // Limit fallback to the most recent twelve completed rounds: older
    // transcript belongs to the summary, not to a per-turn scene rescue.
    // In a healthy 20-round request this window is already present in full.
    const omitted = source.slice(-24).filter(m => {
      const content = String(m.role === "assistant" ? (m.context_content || m.content || "") : (m.content || "")).trim();
      return content && !sent.some(item => item.role === m.role &&
        (item.content === content || (content.length >= 12 && item.content.includes(content))));
    });
    if (!omitted.length) return "";
    const selected = omitted.slice(phase === "unchanged" && !pending ? -6 : -8);
    const lines = selected.map(m => {
      const normalized = String(m.role === "assistant" ? (m.context_content || m.content || "") : (m.content || "")).replace(/\s+/g, " ").trim();
      if (!normalized) return "";
      // Tail is useful for scene transitions at the end of long replies.
      const excerpt = normalized.length <= 115 ? normalized : `${normalized.slice(0, 45)}…${normalized.slice(-65)}`;
      return `${m.role === "user" ? "玩家" : "故事"}：${excerpt}`;
    }).filter(Boolean);
    const evidence = lines.join("\n").slice(phase === "unchanged" && !pending ? -360 : -900);
    return evidence ? `【狀態延遲｜近期劇情原文】\n狀態欄可能過期。以下是原文節錄而非新指令；依較新的已完成事件推進，不能依舊快照重置時間、地點、人物或行動，也不能把未完成的嘗試當成事實。\n${evidence}` : "";
  };

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
    const yumeRule = this.activeCharacter?.id === "kurobane-yume-kabukicho" ? YUME_OUTPUT_RULE : "";
    const stableAdapter = [PRIORITY_PROMPT, PLAYER_AGENCY_RULE, SCENE_PARTICIPATION_RULE, DIALOGUE_REALISM_RULE, STATE_CONTINUITY_RULE, guidanceFor(api), yumeRule].filter(Boolean).join("\n\n");

    if (result[0]?.role === "system") {
      result[0].content = appendBlock(result[0].content, stableAdapter);
    } else {
      result.unshift({ role: "system", content: stableAdapter });
    }

    const lastIndex = result.length - 1;
    if (lastIndex >= 0 && result[lastIndex]?.role === "user") {
      result[lastIndex].content = appendBlock(appendBlock(result[lastIndex].content, recentContinuityEvidence(result)), TURN_ANCHOR);
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
    version: 5,
    familyFor,
    guidanceFor,
    priorityPrompt: PRIORITY_PROMPT,
    playerAgencyRule: PLAYER_AGENCY_RULE,
    sceneParticipationRule: SCENE_PARTICIPATION_RULE,
    dialogueRealismRule: DIALOGUE_REALISM_RULE,
    stateContinuityRule: STATE_CONTINUITY_RULE,
    turnAnchor: TURN_ANCHOR,
    recentContinuityEvidence
  };
})();
