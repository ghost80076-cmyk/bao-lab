(() => {
  if (typeof App === "undefined" || App.__chatShellFixed) return;

  const syncChatHeader = () => {
    const image = document.getElementById("chat-title-avatar");
    if (!image) return;
    const character = App.activeCharacter;
    const avatar = character?.avatar || character?.meta?.avatar || "";
    if (avatar) {
      image.src = avatar;
      image.alt = `${character?.name || character?.meta?.name || "角色"}角色圖`;
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.alt = "";
      image.hidden = true;
    }
  };

  // Older UI modules insert new controls before the original exit button. The
  // grouped tool navigation can move that button inside a nested <details>,
  // where it is no longer a direct child of the sidebar. Restore the original
  // node (and its click handler) before the synchronous render/injection chain.
  // Navigation may regroup it afterward; we do not clone controls or save data.
  const restoreSidebarInsertionAnchor = () => {
    const aside = document.querySelector("#chat-view .chat-layout > aside");
    const exit = aside?.querySelector('.text-button[onclick*="exitChat"]');
    if (aside && exit && exit.parentElement !== aside) aside.prepend(exit);
  };

  const ensureChatHeader = () => {
    const main = document.querySelector("#chat-view .chat-main");
    const stream = document.getElementById("chat-stream");
    if (!main || !stream) return;
    if (!document.getElementById("chat-title")) {
      const header = document.createElement("div");
      header.className = "chat-topline";
      header.innerHTML = '<img id="chat-title-avatar" class="chat-title-avatar" alt="" hidden><div class="chat-title-copy"><div class="eyebrow">ACTIVE STORY</div><h2 id="chat-title"></h2></div>';
      if (stream.parentElement === main) main.insertBefore(header, stream);
      else main.prepend(header);
    }
    syncChatHeader();
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    restoreSidebarInsertionAnchor();
    ensureChatHeader();
    const result = originalRenderChatShell(fresh);
    syncChatHeader();
    return result;
  };

  ensureChatHeader();
  App.__chatShellFixed = true;
})();

// Keep the presentation layer independent of story saves and provider routes.
(() => {
  if (!document.querySelector('link[href="css/chat-experience.css"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/chat-experience.css';
    document.head.append(css);
  }
  const load = src => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  load('js/chat-presentation-core.js')
    .then(() => load('js/chat-experience.js'))
    .catch(error => console.warn('BAO/LAB chat presentation did not load:', error));
})();
