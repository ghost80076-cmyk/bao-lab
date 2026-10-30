(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || typeof Storage === "undefined" || window.BAOStoryReader) return;

  const IMAGE_OVERRIDES = {
    linchenfeng: "https://i.meee.com.tw/UHKTM1O.jpg"
  };
  const suggestionCache = new WeakMap();
  const hiddenInspirations = new WeakSet();
  const inFlightInspirations = new WeakMap();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clone = value => Storage.clone(value);
  const safeMessage = message => ({ role: message.role, content: String(message.content || "") });

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/story-reader.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-reader.css?v=3";
    document.head.appendChild(link);
  };

  const characterId = character => String(character?.id || character?.meta?.id || "");
  const characterName = character => String(character?.name || character?.meta?.name || "角色");
  const characterAvatar = character => {
    const id = characterId(character);
    return IMAGE_OVERRIDES[id] || character?.avatar || character?.meta?.avatar || "";
  };

  const applyImageOverrides = () => {
    (App.characters || []).forEach(character => {
      const url = IMAGE_OVERRIDES[characterId(character)];
      if (!url) return;
      character.avatar = url;
      if (character.meta && typeof character.meta === "object") character.meta.avatar = url;
    });
    if (App.activeCharacter) {
      const url = IMAGE_OVERRIDES[characterId(App.activeCharacter)];
      if (url) {
        App.activeCharacter.avatar = url;
        if (App.activeCharacter.meta && typeof App.activeCharacter.meta === "object") App.activeCharacter.meta.avatar = url;
      }
    }
  };

  const normalizeAssistantMessage = message => {
    if (!message || message.role !== "assistant") return message;
    if (!message.id) message.id = uid("msg");
    if (message.originalContent == null) message.originalContent = String(message.content || "");
    if (!Array.isArray(message.variants) || !message.variants.length) {
      message.variants = [{
        id: uid("variant"),
        type: "original",
        content: String(message.content || ""),
        ...(message.phonePatch ? { phonePatch: clone(message.phonePatch) } : {}),
        createdAt: new Date().toISOString()
      }];
      message.activeVariant = 0;
    }
    message.activeVariant = Math.max(0, Math.min(Number(message.activeVariant || 0), message.variants.length - 1));
    const selected = message.variants[message.activeVariant];
    if (selected?.content != null && String(message.content || "") !== String(selected.content)) {
      const existingIndex = message.variants.findIndex(item => String(item.content || "") === String(message.content || ""));
      if (existingIndex >= 0) message.activeVariant = existingIndex;
      else {
        message.variants.push({ id: uid("variant"), type: message.edited ? "manual-edit" : "legacy", content: String(message.content || ""), createdAt: new Date().toISOString() });
        message.activeVariant = message.variants.length - 1;
      }
    }
    return message;
  };

  const normalizeMessages = () => {
    (Chat.messages || []).forEach(normalizeAssistantMessage);
  };

  const addVariant = (message, content, type, meta = {}) => {
    normalizeAssistantMessage(message);
    const phone = window.BAOPhoneStoryBridge?.extractRevision?.(content);
    const text = String(phone?.text ?? content ?? '').trim();
    if (!text) return false;
    if (phone?.patch) meta = { ...meta, phonePatch: phone.patch };
    const current = message.variants[message.activeVariant];
    // Capture lazily when a real revision is committed, not on every normal
    // turn: long stories already keep the pre-reply revisionBase snapshot.
    if (current && !current.derivedSnapshot && message === Chat.messages.findLast(item => item?.role === 'assistant')) {
      const snapshot = window.BAOStoryRevisionState?.captureSnapshot?.();
      if (snapshot) current.derivedSnapshot = snapshot;
    }
    const modelRevision = ['regenerate', 'ai-rewrite'].includes(type);
    const existingIndex = modelRevision ? -1 : message.variants.findIndex(item => String(item.content || "").trim() === text);
    if (existingIndex >= 0) {
      message.activeVariant = existingIndex;
      message.content = String(message.variants[existingIndex].content || "");
      return true;
    }
    message.variants.push({ id: uid("variant"), type, content: text, createdAt: new Date().toISOString(), ...meta });
    message.activeVariant = message.variants.length - 1;
    message.content = text;
    if (type === "manual-edit") {
      message.edited = true;
      message.editedAt = new Date().toISOString();
    }
    return true;
  };

  const invalidateDerivedMemory = () => {
    Chat.summary = "";
    Chat.summarizedUntil = 0;
    if (window.GameState?.current) GameState.current.memory = [];
  };

  const save = () => {
    try { App.saveStory?.(false); }
    catch (error) { console.warn("BAO/LAB story reader save failed:", error); }
  };

  const setBusy = (element, busy) => {
    const message = element?.closest?.(".message");
    if (message) message.classList.toggle("story-busy", Boolean(busy));
  };

  const clipboard = async text => {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = String(text || "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  };

  const rewriteRichBubble = (bubble, message) => {
    if (!bubble || !message) return;
    const content = String(message.content || "");
    if (message.role === "assistant" && window.BAOSceneHTML?.render) {
      // The selected reader owns native/efficient/free rendering for every
      // committed assistant message, including the authored greeting.
      bubble.innerHTML = BAOSceneHTML.render(content, Boolean(message.greeting));
      bubble.classList.toggle("authored-rich-message", BAOSceneHTML.prefs?.mode !== "native");
    } else if (message.role === "assistant" && /<[a-z][\s\S]*>/i.test(content) && window.BAOChatMarkup?.sanitize) {
      bubble.innerHTML = BAOChatMarkup.sanitize(content);
      bubble.classList.add("authored-rich-message");
    } else {
      bubble.innerHTML = App.formatMessage(content);
      bubble.classList.remove("authored-rich-message");
    }
  };

  const mobileToolBar = () => {
    const main = document.querySelector("#chat-view .chat-main");
    const header = main?.querySelector(".chat-topline");
    if (!main || !header || main.querySelector(".story-mobile-tools")) return;

    const bar = document.createElement("nav");
    bar.className = "story-mobile-tools";
    bar.setAttribute("aria-label", "故事工具");
    bar.innerHTML = '<button type="button" data-story-mobile-action="save">快速儲存</button><button type="button" data-story-mobile-action="save-as">另存新檔</button><button type="button" data-story-mobile-action="narrative">今晚的故事</button><button type="button" data-story-mobile-action="reply">回覆設定</button><button type="button" data-story-mobile-action="memory">記憶工作台</button>';

    const clickExisting = selector => {
      const target = document.querySelector(selector);
      if (target) target.click();
      else alert("功能仍在載入，請稍後再試。");
    };

    bar.addEventListener("click", event => {
      const action = event.target.closest("[data-story-mobile-action]")?.dataset.storyMobileAction;
      if (!action) return;
      if (action === "save") App.saveStory(true);
      if (action === "save-as") clickExisting("#save-slot-button");
      if (action === "narrative") {
        if (window.BAONarrativeSettings?.open) window.BAONarrativeSettings.open();
        else clickExisting('#bao-player-settings [data-bao-open="narrative"]');
      }
      if (action === "reply") clickExisting('#bao-player-settings [data-bao-open="reply"]');
      if (action === "memory") {
        if (window.BAOMemoryWorkbench?.open) window.BAOMemoryWorkbench.open();
        else clickExisting('#bao-player-settings [data-bao-open="memory"]');
      }
    });

    header.insertAdjacentElement("afterend", bar);
  };

  const historyBefore = index => {
    const rounds = Math.max(6, Number(App.config?.memory?.maxRounds || 20));
    return Chat.messages.slice(Math.max(0, index - rounds * 2), index).map(safeMessage);
  };

  const latestAssistantIndex = () => Chat.messages.findLastIndex(message => message?.role === "assistant");
  const canRevise = index => index === latestAssistantIndex();
  const requireLatestReply = index => {
    if (canRevise(index)) return true;
    alert("為避免既有世界狀態與後續劇情不同步，目前只能修改最新一則 AI 回覆。若要改動舊劇情，請先另存新檔再調整。");
    return false;
  };
  const mainModelToolConfig = kind => ({ ...App.config.api, __storyTool: true, __storyRevision: kind, __storyRevisionToken: {} });
  const commitRevisionEvidence = (message, config) => {
    window.BAOSameModelStateMerge?.commitRevision?.(message, config.__storyRevisionToken);
    try { window.BAOContextInspector?.commitRevision?.(message, config.__storyRevisionToken); }
    catch (_) { /* Optional diagnostics never block a revision. */ }
    try { window.BAORequestLedger?.commitRevision?.(message, config.__storyRevisionToken); }
    catch (_) { /* Optional diagnostics never block a revision. */ }
  };
  const aiToolsAvailable = () => {
    const api = App.config?.api;
    const connected = Boolean(String(api?.key || "").trim()) || Boolean(window.BAOCreditsPilot?.isAccountReady?.(api));
    return connected && !App.config?.demoMode && !App.config?.offlineWorldPreview;
  };
  const aiToolsUnavailableMessage = () => App.config?.demoMode || App.config?.offlineWorldPreview
    ? "目前是本機預覽；完成模型連線後即可使用"
    : "目前尚未完成模型連線；完成後即可使用";

  const parseSuggestions = input => {
    const raw = String(input || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start >= 0 && end > start) {
        const list = JSON.parse(raw.slice(start, end + 1));
        if (Array.isArray(list)) return list.map(String).map(x => x.trim()).filter(Boolean).slice(0, 4);
      }
    } catch {}
    return raw.split(/\r?\n/)
      .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 4);
  };

  // Keep the on-demand helper lean: a short visible scene window, not the full story context.
  // Character limits are a transport safeguard, not a precise token estimate.
  const clipInspirationText = (value, limit) => {
    const text = String(value || "").trim();
    if (text.length <= limit) return text;
    const head = Math.floor(limit * 0.25);
    return text.slice(0, head) + "\n[…中段省略…]\n" + text.slice(-(limit - head));
  };

  const inspirationContext = index => {
    const persona = clipInspirationText(JSON.stringify(Object.fromEntries(Object.entries(App.config?.persona || {}).filter(([key]) => key !== "avatar"))), 900);
    const recent = Chat.messages.slice(Math.max(0, index - 3), index + 1)
      .map((message, offset, list) => {
        const distance = list.length - 1 - offset;
        const limit = distance === 0 ? 2400 : distance === 1 ? 900 : distance === 2 ? 900 : 550;
        return { role: message.role, content: clipInspirationText(message.content, limit) };
      });
    // Do not include credentials in the signature; changing the scene, persona or model invalidates results.
    const api = App.config?.api || {};
    const signature = JSON.stringify([api.model, api.type, api.route, api.baseUrl, persona, recent]);
    return { persona, recent, signature };
  };

  const inspirationPrompt = persona => [
    "你是角色扮演玩家的行動靈感助手，不是故事主持人。",
    "只根據以下玩家 Persona 和可見劇情，提供四個不同且可行的下一步行動。不得洩漏未公開的 NPC 意圖或世界秘密。",
    "不能替玩家虛構心理、回憶或重大決定；選項涵蓋觀察、推進、關係與合理的意外方向。",
    "每項 18～55 字，可直接填入輸入框再修改。只回覆 JSON 字串陣列，不要其他文字。",
    "【玩家 Persona 摘要】\n" + persona
  ].join("\n\n");

  const generateInspirations = async (index, button) => {
    if (!aiToolsAvailable()) {
      alert(aiToolsUnavailableMessage());
      return false;
    }
    const message = Chat.messages[index];
    if (!message || message.role !== "assistant") return false;
    normalizeAssistantMessage(message);
    const context = inspirationContext(index);
    const story = window.GameState?.current;
    const cached = suggestionCache.get(message);
    if (cached?.owner === story && cached.signature === context.signature && cached.suggestions?.length) {
      hiddenInspirations.delete(message);
      decorateStream();
      return true;
    }
    const pending = inFlightInspirations.get(message);
    if (pending?.owner === story && pending.signature === context.signature) {
      try { return await pending.promise; }
      catch { return false; }
    }

    const originalLabel = button?.textContent || "";
    setBusy(button, true);
    if (button) button.textContent = "產生中…";
    const request = (async () => {
      // A distinct story-tool request must not be routed as memory summarization.
      const result = await API.send({
        ...App.config.api,
        __storyTool: true,
        __inspirationTask: true,
        maxOutputTokens: 1024
      }, [
        { role: "system", content: inspirationPrompt(context.persona) },
        ...context.recent,
        { role: "user", content: "依照眼前情境提供四個玩家行動靈感。" }
      ]);
      const suggestions = parseSuggestions(result?.text || "");
      if (!suggestions.length) throw new Error("模型沒有回傳可用的行動建議。");
      // An older response must not repopulate a different story or an edited scene.
      if (window.GameState?.current !== story || Chat.messages[index] !== message ||
          inspirationContext(index).signature !== context.signature) return false;
      suggestionCache.set(message, { owner: story, signature: context.signature, suggestions });
      hiddenInspirations.delete(message);
      decorateStream();
      return true;
    })();
    inFlightInspirations.set(message, { owner: story, signature: context.signature, promise: request });
    try {
      return await request;
    } catch (error) {
      alert("行動靈感產生失敗：" + String(error?.message || error));
      return false;
    } finally {
      if (inFlightInspirations.get(message)?.promise === request) inFlightInspirations.delete(message);
      if (button) button.textContent = originalLabel;
      setBusy(button, false);
    }
  };

  const inspireLatest = async button => {
    const index = latestAssistantIndex();
    if (index < 0) {
      alert("目前還沒有可參考的 AI 回覆。");
      return false;
    }
    return generateInspirations(index, button || null);
  };

  const rewriteMessage = async (index, button) => {
    const message = Chat.messages[index];
    if (!message || message.role !== "assistant" || !requireLatestReply(index)) return;
    if (!aiToolsAvailable()) {
      alert(aiToolsUnavailableMessage());
      return;
    }
    const instruction = window.prompt("改寫要求（例如：更詳細、增加對話、放慢節奏、語氣更克制）：", "保留事件結果，讓文字更自然、更有畫面");
    if (instruction == null || !instruction.trim()) return;
    setBusy(button, true);
    try {
      const config = mainModelToolConfig('rewrite');
      const result = await API.send(config, [
        { role: "system", content: `${App.buildSystemPrompt()}\n\n【本次任務】只改寫指定的上一則 AI 回覆，不要推進新事件，不要替玩家新增台詞、心理或行動。` },
        ...historyBefore(index),
        { role: "user", content: `【改寫要求】\n${instruction.trim()}\n\n【原 AI 回覆】\n${message.content}\n\n只輸出改寫後的回覆正文。` }
      ]);
      if (!result?.text?.trim()) throw new Error("模型沒有回傳改寫內容。");
      addVariant(message, result.text, "ai-rewrite", { instruction: instruction.trim() });
      commitRevisionEvidence(message, config);
      invalidateDerivedMemory();
      save();
      App.renderChatShell(false);
    } catch (error) {
      alert(`AI 改寫失敗：${error.message || error}`);
    } finally {
      setBusy(button, false);
    }
  };

  const regenerateMessage = async (index, button) => {
    const message = Chat.messages[index];
    if (!message || message.role !== "assistant" || !requireLatestReply(index)) return;
    if (!aiToolsAvailable()) {
      alert(aiToolsUnavailableMessage());
      return;
    }
    setBusy(button, true);
    try {
      const previous = historyBefore(index);
      if (!previous.some(item => item.role === "user")) throw new Error("找不到可對應的玩家輸入。");
      const config = mainModelToolConfig('regenerate');
      const result = await API.send(config, [
        { role: "system", content: App.buildSystemPrompt() },
        ...previous
      ]);
      if (!result?.text?.trim()) throw new Error("模型沒有回傳新的內容。");
      addVariant(message, result.text, "regenerate");
      commitRevisionEvidence(message, config);
      invalidateDerivedMemory();
      save();
      App.renderChatShell(false);
    } catch (error) {
      alert(`重新生成失敗：${error.message || error}`);
    } finally {
      setBusy(button, false);
    }
  };

  const editMessage = (index, messageElement) => {
    const message = Chat.messages[index];
    const bubble = messageElement?.querySelector(".bubble");
    if (!message || message.role !== "assistant" || !bubble || !requireLatestReply(index)) return;
    if (messageElement.querySelector(".story-inline-editor")) return;

    const stream = document.getElementById("chat-stream");
    const priorScrollTop = stream?.scrollTop ?? 0;
    const editor = document.createElement("div");
    editor.className = "story-inline-editor";
    editor.innerHTML = `<textarea aria-label="編輯 AI 回覆"></textarea><div class="story-inline-actions"><button type="button" class="secondary" data-cancel>取消</button><button type="button" class="primary" data-save>儲存</button></div>`;
    const textarea = editor.querySelector("textarea");
    textarea.value = String(message.content || "");
    bubble.replaceChildren(editor);
    document.getElementById("chat-view")?.classList.add("story-reply-editing");
    textarea.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (stream?.isConnected) stream.scrollTop = priorScrollTop;
    });

    const finishEditing = () => document.getElementById("chat-view")?.classList.remove("story-reply-editing");
    editor.querySelector("[data-cancel]").onclick = () => {
      finishEditing();
      decorateStream();
    };
    editor.querySelector("[data-save]").onclick = () => {
      const next = editor.querySelector("textarea").value.trim();
      if (!next) {
        alert("回覆不能是空白。");
        return;
      }
      if (next !== String(message.content || "").trim()) {
        addVariant(message, next, "manual-edit");
        invalidateDerivedMemory();
        save();
      }
      finishEditing();
      App.renderChatShell(false);
    };
  };

  const switchVariant = (index, direction) => {
    if (!requireLatestReply(index)) return;
    const message = Chat.messages[index];
    normalizeAssistantMessage(message);
    if (!message?.variants?.length) return;
    const next = (message.activeVariant + direction + message.variants.length) % message.variants.length;
    message.activeVariant = next;
    message.content = String(message.variants[next].content || "");
    invalidateDerivedMemory();
    save();
    App.renderChatShell(false);
  };

  const renderSuggestionPanel = (message, index) => {
    const entry = suggestionCache.get(message);
    if (!entry || entry.owner !== window.GameState?.current || entry.signature !== inspirationContext(index).signature || hiddenInspirations.has(message)) return null;
    const list = entry.suggestions;
    if (!list?.length) return null;
    const panel = document.createElement("div");
    panel.className = "story-inspiration-panel";
    panel.innerHTML = `<div class="story-inspiration-head"><span>✦ 行動靈感 · 點一下填入輸入框，不會自動送出</span><button type="button" class="story-copy-chip" data-close title="關閉">×</button></div>`;
    list.forEach((text, suggestionIndex) => {
      const row = document.createElement("div");
      row.className = "story-inspiration-row";
      const fill = document.createElement("button");
      fill.type = "button";
      fill.className = "story-inspiration-chip";
      fill.textContent = `${suggestionIndex + 1}. ${text}`;
      fill.onclick = () => {
        const input = document.getElementById("user-input");
        if (!input) return;
        input.value = text;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      };
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "story-copy-chip";
      copyButton.textContent = "⧉";
      copyButton.title = "複製";
      copyButton.onclick = async () => {
        await clipboard(text);
        copyButton.textContent = "✓";
        setTimeout(() => { copyButton.textContent = "⧉"; }, 900);
      };
      row.append(fill, copyButton);
      panel.appendChild(row);
    });
    panel.querySelector("[data-close]").onclick = () => {
      hiddenInspirations.add(message);
      panel.remove();
    };
    return panel;
  };

  const decorateAssistantMessage = (element, message, index) => {
    normalizeAssistantMessage(message);
    const bubble = element.querySelector(".bubble");
    if (!bubble) return;
    rewriteRichBubble(bubble, message);

    const tools = document.createElement("div");
    tools.className = "story-message-tools";
    tools.innerHTML = `
      <button type="button" data-edit>✎ 編輯</button>
      <button type="button" data-rewrite>✦ AI 改寫</button>
      <button type="button" data-regenerate>↻ 重生成</button>
      <button type="button" data-inspire>☄ 行動靈感</button>
      <button type="button" data-copy>⧉ 複製</button>
    `;
    element.appendChild(tools);

    tools.querySelector("[data-edit]").onclick = () => editMessage(index, element);
    tools.querySelector("[data-rewrite]").onclick = event => rewriteMessage(index, event.currentTarget);
    tools.querySelector("[data-regenerate]").onclick = event => regenerateMessage(index, event.currentTarget);
    tools.querySelector("[data-inspire]").onclick = event => generateInspirations(index, event.currentTarget);
    tools.querySelector("[data-copy]").onclick = async event => {
      const button = event.currentTarget;
      await clipboard(message.content);
      const before = button.textContent;
      button.textContent = "✓ 已複製";
      setTimeout(() => { button.textContent = before; }, 900);
    };

    if (!aiToolsAvailable()) {
      ["[data-rewrite]", "[data-regenerate]", "[data-inspire]"].forEach(selector => {
        const button = tools.querySelector(selector);
        if (!button) return;
        button.disabled = true;
        button.title = aiToolsUnavailableMessage();
      });
    }

    if (!canRevise(index)) {
      ["[data-edit]", "[data-rewrite]", "[data-regenerate]"].forEach(selector => {
        const button = tools.querySelector(selector);
        if (!button) return;
        button.disabled = true;
        button.title = "為保持狀態一致，只能修改最新一則 AI 回覆";
      });
    }

    if (message.variants.length > 1 || message.edited) {
      const switcher = document.createElement("div");
      switcher.className = "story-variant-switcher";
      const edited = message.edited ? '<span class="story-edited-badge">已編輯</span>' : "";
      switcher.innerHTML = `<button type="button" data-prev>‹</button><span>${message.activeVariant + 1} / ${message.variants.length}</span><button type="button" data-next>›</button>${edited}`;
      switcher.querySelector("[data-prev]").onclick = () => switchVariant(index, -1);
      switcher.querySelector("[data-next]").onclick = () => switchVariant(index, 1);
      if (!canRevise(index)) switcher.querySelectorAll("button").forEach(button => { button.disabled = true; button.title = "舊回覆版本已鎖定"; });
      element.appendChild(switcher);
    }

    const inspiration = renderSuggestionPanel(message, index);
    if (inspiration) element.appendChild(inspiration);
  };

  const decorateGreeting = element => {
    if (!element) return;
    // A standalone opening is not in Chat.messages; repaint from the original
    // card instead of leaving the HTML-escaped bootstrap bubble on screen.
    const bubble = element.querySelector(".bubble");
    const greeting = App.activeCharacter?.greeting || App.activeCharacter?.content?.greeting || "";
    if (bubble && greeting) {
      const html = window.BAOSceneHTML?.render
        ? BAOSceneHTML.render(greeting, true)
        : window.BAOChatMarkup?.sanitize ? BAOChatMarkup.sanitize(greeting) : App.formatMessage(greeting);
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
      bubble.dataset.authoredGreeting = "true";
      element.dataset.storyGreeting = "true";
    }
    if (element.querySelector(".story-message-tools")) return;
    const tools = document.createElement("div");
    tools.className = "story-message-tools";
    tools.innerHTML = '<button type="button" data-copy>⧉ 複製開場</button>';
    tools.querySelector("[data-copy]").onclick = async event => {
      const source = App.activeCharacter?.greeting || App.activeCharacter?.content?.greeting || element.querySelector(".bubble")?.innerText || "";
      await clipboard(source);
      event.currentTarget.textContent = "✓ 已複製";
      setTimeout(() => { event.currentTarget.textContent = "⧉ 複製開場"; }, 900);
    };
    element.appendChild(tools);
  };

  function decorateStream() {
    applyImageOverrides();
    normalizeMessages();
    mobileToolBar();
    const stream = document.getElementById("chat-stream");
    if (!stream) return;
    stream.querySelectorAll(".story-message-tools,.story-variant-switcher,.story-inspiration-panel").forEach(node => node.remove());
    const elements = [...stream.querySelectorAll(":scope > .message")];
    const offset = Math.max(0, elements.length - Chat.messages.length);
    elements.forEach((element, domIndex) => {
      const index = domIndex - offset;
      element.dataset.messageIndex = String(index);
      if (index < 0) {
        decorateGreeting(element);
        return;
      }
      const message = Chat.messages[index];
      if (!message) return;
      const bubble = element.querySelector(".bubble");
      if (message.role === "assistant") decorateAssistantMessage(element, message, index);
      else if (bubble) rewriteRichBubble(bubble, message);
    });
  }

  ensureStyles();
  applyImageOverrides();

  const originalAdd = Chat.add.bind(Chat);
  Chat.add = function(role, content) {
    originalAdd(role, content);
    const message = this.messages[this.messages.length - 1];
    if (role === "assistant") normalizeAssistantMessage(message);
    return message;
  };

  const originalContext = Chat.context.bind(Chat);
  Chat.context = async function(config) {
    const list = await originalContext(config);
    return (list || []).map(message => ({ role: message.role, content: String(message.content || "") }));
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    applyImageOverrides();
    const result = originalRenderChatShell(fresh);
    setTimeout(decorateStream, 0);
    setTimeout(decorateStream, 100);
    return result;
  };

  const originalSendMessage = App.sendMessage.bind(App);
  App.sendMessage = async function(...args) {
    const result = await originalSendMessage(...args);
    setTimeout(decorateStream, 0);
    return result;
  };

  const originalOpenCharacter = App.openCharacter?.bind(App);
  if (originalOpenCharacter) {
    App.openCharacter = function(id) {
      applyImageOverrides();
      const result = originalOpenCharacter(id);
      applyImageOverrides();
      return result;
    };
  }

  setTimeout(() => {
    applyImageOverrides();
    try {
      const activeFilter = document.querySelector(".filter.active")?.dataset.filter || "all";
      App.renderCharacters?.(activeFilter);
    } catch {}
    if (document.getElementById("chat-view")?.classList.contains("active")) decorateStream();
  }, 0);

  window.BAOStoryReader = {
    version: 2,
    normalizeMessages,
    decorateStream,
    refreshTools: decorateStream,
    inspireLatest,
    aiToolsAvailable,
    aiToolsUnavailableMessage,
    addVariant,
    invalidateDerivedMemory,
    imageOverrides: clone(IMAGE_OVERRIDES)
  };
})();
