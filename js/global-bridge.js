(() => {
  if (typeof App !== "undefined") window.App = App;
  if (typeof Chat !== "undefined") window.Chat = Chat;
  if (typeof GameState !== "undefined") window.GameState = GameState;
  if (typeof Storage !== "undefined") window.Storage = Storage;
  if (typeof CharacterEngine !== "undefined") window.CharacterEngine = CharacterEngine;

  // Preserve original messages for display, edits, and backups. Clean only copies sent to models.
  const narrativeText = value => {
    const source = String(value ?? "");
    if (!/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/i.test(source)) return source;
    const safe = source.replace(/<(script|style|iframe|object|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    const spaced = safe.replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|section|article|li|h[1-6]|tr|blockquote)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    if (typeof DOMParser === "undefined") return spaced.replace(/&(?:nbsp|#160);/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").trim();
    const doc = new DOMParser().parseFromString(spaced, "text/html");
    return (doc.body.textContent || "").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  if (typeof Chat !== "undefined" && typeof Chat.context === "function" && !Chat.__baoContextPresentationGuard) {
    const originalContext = Chat.context.bind(Chat);
    Chat.context = async function(...args) {
      const messages = await originalContext(...args);
      return messages.map(message => message.role === "assistant" && typeof message.content === "string"
        ? { ...message, content: narrativeText(message.content) }
        : message);
    };
    Chat.__baoContextPresentationGuard = true;
  }
  // Smart-memory summaries bypass Chat.context. Sanitize their request copies too,
  // without changing Chat.messages or the source signature used to detect stale summaries.
  if (typeof API !== "undefined" && typeof API.send === "function" && !API.__baoMemoryPresentationGuard) {
    const originalSend = API.send.bind(API);
    API.send = function(config, messages, ...rest) {
      if (!config?.__memoryTask || !Array.isArray(messages)) return originalSend(config, messages, ...rest);
      const cleaned = messages.map(message => message.role === "user" && typeof message.content === "string"
        ? { ...message, content: narrativeText(message.content) }
        : message);
      return originalSend(config, cleaned, ...rest);
    };
    API.__baoMemoryPresentationGuard = true;
  }
  // Optional UI only. Keep Node/test harnesses with partial DOMs working.
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function' && document.head && !document.querySelector('script[src="js/cache-cost-panel.js"]')) {
    const script = document.createElement('script');
    script.src = 'js/cache-cost-panel.js';
    script.onerror = () => console.warn('BAO/LAB cache and cost panel failed to load');
    document.head.appendChild(script);
  }
})();

// Credits pilot is an optional addition; failure to load must not affect BYOK.
if (typeof document !== 'undefined' && document.head && !document.querySelector('script[src="js/credits-pilot.js"]')) {
  const creditsScript = document.createElement('script');
  creditsScript.src = 'js/credits-pilot.js';
  creditsScript.onerror = () => console.warn('BAO/LAB invited credits pilot failed to load; personal API keys remain available.');
  document.head.appendChild(creditsScript);
}

// Load recovery separately: the character library loads asynchronously from site-ui.js.
if (typeof document !== 'undefined' && document.head && !document.querySelector('script[src="js/character-library-repair.js"]')) {
  const repairScript = document.createElement('script');
  repairScript.src = 'js/character-library-repair.js';
  repairScript.onerror = () => console.warn('BAO/LAB character library recovery failed to load. Existing data was not changed.');
  document.head.appendChild(repairScript);
}