(() => {
  if (typeof App !== "undefined") window.App = App;
  if (typeof Chat !== "undefined") window.Chat = Chat;
  if (typeof GameState !== "undefined") window.GameState = GameState;

  // Keep the original transcript for display, revisions and backups. Only the
  // assistant messages copied into the next story request lose presentation HTML.
  if (typeof Chat !== "undefined" && !Chat.__baoContextPresentationGuard) {
    const originalContext = Chat.context.bind(Chat);
    const narrativeText = value => {
      const source = String(value ?? "");
      if (!/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/i.test(source)) return source;
      // Remove executable and styling content, not just its enclosing tags.
      const safe = source.replace(/<(script|style|iframe|object|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
      const spaced = safe.replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|section|article|li|h[1-6]|tr|blockquote)\s*>/gi, "\n")
        .replace(/<[^>]+>/g, "");
      if (typeof DOMParser === "undefined") return spaced.replace(/&(?:nbsp|#160);/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").trim();
      const doc = new DOMParser().parseFromString(spaced, "text/html");
      return (doc.body.textContent || "").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    };
    Chat.context = async function(...args) {
      const messages = await originalContext(...args);
      return messages.map(message => message.role === "assistant" && typeof message.content === "string"
        ? { ...message, content: narrativeText(message.content) }
        : message);
    };
    Chat.__baoContextPresentationGuard = true;
  }
})();
