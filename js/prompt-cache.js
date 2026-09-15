(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined") return;

  const MEMORY_HEADERS = new Set(["玩家手動記憶", "Context Pack · 玩家已確認的前情"]);
  const DYNAMIC_HEADERS = new Set(["本輪動態角色規則", "目前核心狀態", "本輪相關世界資料", "本輪人物狀態"]);
  const headerOf = block => String(block.match(/^【([^】]+)】/)?.[1] || "").trim();

  const partitionSystemPrompt = prompt => {
    const blocks = String(prompt || "").split(/\n{2,}(?=【[^】]+】)/).map(value => value.trim()).filter(Boolean);
    const stable = [], memory = [], dynamic = [];
    blocks.forEach(block => {
      const header = headerOf(block);
      if (MEMORY_HEADERS.has(header)) memory.push(block);
      else if (DYNAMIC_HEADERS.has(header)) dynamic.push(block);
      else stable.push(block);
    });
    return { stable: stable.join("\n\n"), memory: memory.join("\n\n"), dynamic: dynamic.join("\n\n") };
  };

  const storySessionId = () => {
    if (!window.GameState?.current) return "";
    if (!GameState.current.storySessionId) {
      const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      GameState.current.storySessionId = `bao-lab:${App.activeCharacter?.id || "story"}:${random}`;
    }
    return GameState.current.storySessionId;
  };

  App.buildMessages = async function(config = this.config) {
    const context = await Chat.context(config);
    const latestIndex = context.length - 1;
    const hasLatestUser = latestIndex >= 0 && context[latestIndex]?.role === "user";
    const latest = hasLatestUser ? context[latestIndex] : null;
    const earlier = hasLatestUser ? context.slice(0, latestIndex) : context.slice();
    const parts = partitionSystemPrompt(this.buildSystemPrompt());
    const memorySystems = [];
    const history = [];

    if (parts.memory) memorySystems.push(parts.memory);
    earlier.forEach(message => {
      if (message.role === "system") memorySystems.push(String(message.content || ""));
      else history.push({ role: message.role, content: String(message.content || "") });
    });

    const messages = [{ role: "system", content: parts.stable }];
    if (memorySystems.length) messages.push({ role: "system", content: memorySystems.join("\n\n") });
    messages.push(...history);
    if (latest) {
      const content = [parts.dynamic, `【玩家最新輸入】\n${String(latest.content || "")}`].filter(Boolean).join("\n\n");
      messages.push({ role: "user", content });
    } else if (parts.dynamic) messages.push({ role: "user", content: parts.dynamic });
    return messages;
  };

  App.applyProviderContext = function(apiConfig = {}) {
    const preset = this.getSelectedPreset?.();
    const effective = {
      ...apiConfig,
      route: apiConfig.route || preset?.route || "custom",
      cacheMode: apiConfig.cacheMode || preset?.cache || "unknown",
      cacheEnabled: this.config?.memory?.cache !== false
    };
    if (API.isOpenRouter(effective)) effective.sessionId = storySessionId();
    return effective;
  };

  window.BAOPromptCache = { partitionSystemPrompt, storySessionId };
})();
