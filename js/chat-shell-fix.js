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

  const ensureChatHeader = () => {
    const main = document.querySelector("#chat-view .chat-main");
    const stream = document.getElementById("chat-stream");
    if (!main || !stream) return;
    if (!document.getElementById("chat-title")) {
      const header = document.createElement("div");
      header.className = "chat-topline";
      header.innerHTML = '<img id="chat-title-avatar" class="chat-title-avatar" alt="" hidden><div class="chat-title-copy"><div class="eyebrow">ACTIVE STORY</div><h2 id="chat-title"></h2></div>';
      main.insertBefore(header, stream);
    }
    syncChatHeader();
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    ensureChatHeader();
    const result = originalRenderChatShell(fresh);
    syncChatHeader();
    return result;
  };

  ensureChatHeader();
  App.__chatShellFixed = true;
})();
