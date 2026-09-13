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
          if (url) { el.setAttribute("href", url); el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer"); }
          else el.removeAttribute(attr.name);
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

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    originalRenderChatShell(fresh);
    if (!this.activeCharacter || (!fresh && Chat.messages.length)) return;
    const bubble = document.querySelector("#chat-stream .message.assistant .bubble");
    if (bubble) {
      bubble.innerHTML = sanitize(this.activeCharacter.greeting || "");
      bubble.classList.add("authored-rich-message");
    }
  };

  window.BAOChatMarkup = { sanitize };
})();
