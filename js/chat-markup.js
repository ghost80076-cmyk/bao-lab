(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined") return;

  const allowedTags = new Set([
    "DIV","P","SPAN","BR","STRONG","B","EM","I","U","S","SMALL","MARK",
    "BLOCKQUOTE","HR","UL","OL","LI","H1","H2","H3","H4","H5","H6",
    "IMG","A","DETAILS","SUMMARY","CODE","PRE","AUDIO","SOURCE"
  ]);
  const dropTags = new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","FORM","META","LINK","BASE"]);
  const safeAttrs = new Set(["class","title","alt","width","height","loading","controls","loop","preload","open"]);

  const safeURL = (value, image = false) => {
    const v = String(value || "").trim();
    if (/^https?:\/\//i.test(v)) return v;
    if (image && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(v)) return v;
    return "";
  };

  const cleanStyle = value => {
    let s = String(value || "");
    if (/expression\s*\(|javascript\s*:|url\s*\(|@import|behavior\s*:/i.test(s)) return "";
    return s.slice(0, 2500);
  };

  const sanitize = raw => {
    const source = String(raw || "");
    if (!/[<][a-z!/]/i.test(source)) return App.formatMessage(source);
    const doc = new DOMParser().parseFromString(`<div id="bao-rich-root">${source}</div>`, "text/html");
    const root = doc.getElementById("bao-rich-root");
    if (!root) return App.formatMessage(source);

    [...root.querySelectorAll("*")].forEach(el => {
      const tag = el.tagName;
      if (dropTags.has(tag)) { el.remove(); return; }
      if (!allowedTags.has(tag)) {
        el.replaceWith(...el.childNodes);
        return;
      }

      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "id") { el.removeAttribute(attr.name); return; }
        if (name === "style") {
          const style = cleanStyle(attr.value);
          if (style) el.setAttribute("style", style); else el.removeAttribute("style");
          return;
        }
        if (tag === "A" && name === "href") {
          const url = safeURL(attr.value, false);
          if (url) {
            el.setAttribute("href", url);
            el.setAttribute("target", "_blank");
            el.setAttribute("rel", "noopener noreferrer");
          } else el.removeAttribute(attr.name);
          return;
        }
        if (tag === "IMG" && name === "src") {
          const url = safeURL(attr.value, true);
          if (url) el.setAttribute("src", url); else el.removeAttribute(attr.name);
          return;
        }
        if ((tag === "AUDIO" || tag === "SOURCE") && name === "src") {
          const url = safeURL(attr.value, false);
          if (url) el.setAttribute("src", url); else el.removeAttribute(attr.name);
          return;
        }
        if (tag === "SOURCE" && name === "type") return;
        if (!safeAttrs.has(name)) el.removeAttribute(attr.name);
      });

      if (tag === "IMG") el.setAttribute("loading", "lazy");
      if (tag === "AUDIO") el.removeAttribute("autoplay");
    });

    return root.innerHTML;
  };

  const renderAuthoredGreeting = () => {
    const character = App.activeCharacter;
    if (!character || Chat.messages.length) return false;
    const stream = document.getElementById("chat-stream");
    const bubble = stream?.querySelector(".message.assistant .bubble");
    if (!bubble) return false;

    bubble.innerHTML = window.BAOSceneHTML ? window.BAOSceneHTML.render(character.greeting || "", true) : sanitize(character.greeting || "");
    bubble.classList.add("authored-rich-message");
    bubble.dataset.authoredGreeting = "true";
    return true;
  };

  const repairGreetingSoon = () => {
    renderAuthoredGreeting();
    setTimeout(renderAuthoredGreeting, 0);
    setTimeout(renderAuthoredGreeting, 80);
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    originalRenderChatShell(fresh);
    if (fresh || !Chat.messages.length) repairGreetingSoon();
  };

  const originalShowView = App.showView.bind(App);
  App.showView = function(name) {
    const result = originalShowView(name);
    if (name === "chat") repairGreetingSoon();
    return result;
  };

  if (document.getElementById("chat-view")?.classList.contains("active")) repairGreetingSoon();

  window.BAOChatMarkup = { sanitize, renderAuthoredGreeting };
  const loadSceneStoryPreferences = () => {
    if (!window.BAOSceneHTML || window.BAOSceneStoryPreferences || document.querySelector('script[src="js/scene-story-preferences.js"]')) return;
    const settings = document.createElement('script');
    settings.src = 'js/scene-story-preferences.js';
    settings.onerror = () => console.warn('BAO/LAB per-story scene preferences failed to load');
    document.head.appendChild(settings);
  };
  let sceneScript = document.querySelector('script[src="js/scene-html-modes.js"]');
  if (!sceneScript) {
    const script = document.createElement('script');
    script.src = 'js/scene-html-modes.js';
    script.onerror = () => console.warn('BAO/LAB scene HTML controls failed to load');
    script.addEventListener('load', loadSceneStoryPreferences, { once: true });
    document.head.appendChild(script);
  } else if (window.BAOSceneHTML) loadSceneStoryPreferences();
  else sceneScript.addEventListener('load', loadSceneStoryPreferences, { once: true });
  // The editor uses the same sanitizer as the player view and only loads after
  // the world-state field definitions become available.
  const loadBindingEditor = () => {
    if (!window.BAOCharacterStatus || document.querySelector('script[src="js/author-status-binding.js"]')) return Boolean(window.BAOCharacterStatus);
    const script = document.createElement('script');
    script.src = 'js/author-status-binding.js';
    script.onerror = () => console.warn('BAO/LAB author status binding editor failed to load');
    document.head.appendChild(script);
    return true;
  };
  if (!loadBindingEditor()) {
    let attempts = 0;
    const timer = setInterval(() => { if (loadBindingEditor() || ++attempts >= 60) clearInterval(timer); }, 150);
  }
  if (!document.querySelector('script[src="js/story-image-prompts.js"]')) {
    const script = document.createElement('script');
    script.src = 'js/story-image-prompts.js';
    script.onerror = () => console.warn('BAO/LAB story image prompt controls failed to load');
    document.head.appendChild(script);
  }
})();
