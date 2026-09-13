(() => {
  if (typeof App === "undefined" || App.__chatShellFixed) return;

  const ensureChatHeader = () => {
    if (document.getElementById("chat-title")) return;
    const main = document.querySelector("#chat-view .chat-main");
    const stream = document.getElementById("chat-stream");
    if (!main || !stream) return;

    const header = document.createElement("div");
    header.className = "chat-topline";
    header.innerHTML = '<div class="eyebrow">ACTIVE STORY</div><h2 id="chat-title"></h2>';
    main.insertBefore(header, stream);
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    ensureChatHeader();
    return originalRenderChatShell(fresh);
  };

  ensureChatHeader();
  App.__chatShellFixed = true;
})();
