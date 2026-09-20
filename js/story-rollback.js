(() => {
  "use strict";
  if (window.BAOStoryRollback || !window.BAOStoryLibrary || !window.BAOStoryBranches) return;

  const Library = window.BAOStoryLibrary;
  let busy = false;
  let decorating = false;
  const fail = message => { throw new Error(message); };
  const sameConnection = (left = {}, right = {}) => {
    const url = value => String(value || "").trim().replace(/\/+$/, "");
    return Boolean(url(left.baseUrl) && url(right.baseUrl)) && url(left.baseUrl) === url(right.baseUrl)
      && String(left.protocol || "openai") === String(right.protocol || "openai");
  };

  // A rewind must use a genuine saved point-in-time state, never today's state
  // with the visible message list truncated.
  const preflight = async (index, messageId) => {
    if (App.__requestPending || Chat.summarizing) fail("正在生成或整理記憶，請完成或取消後再回溯。");
    await window.BAOStoryRevisionState?.whenIdle?.();
    if (App.__requestPending || Chat.summarizing) fail("正在生成或整理記憶，請完成或取消後再回溯。");
    if (!await Library.open()) fail("這台裝置的故事庫無法開啟，回溯已取消。");
    if (!App.saveStory(false)) fail("目前的故事無法儲存，回溯已取消。");
    await Storage.flush();
    if (!await Library.flush()) fail("故事庫未能完成儲存，回溯已取消。");
    const refs = Library.refs();
    const source = Chat.messages[index];
    if (!refs.storyId || !refs.chapterId || source?.role !== "assistant" || source.id !== messageId)
      fail("故事已切換或回覆已變動，請重新選擇回溯點。");
    if (index >= Chat.messages.length - 1) fail("這已經是目前故事的最後一則回覆，無須回溯。");
    const records = await Library.allRecords();
    const point = records.find(record => record.kind === "message" && record.storyId === refs.storyId
      && record.chapterId === refs.chapterId && record.messageId === messageId && record.role === "assistant" && record.seq === index);
    const checkpoint = records.find(record => record.kind === "checkpoint" && record.storyId === refs.storyId
      && record.chapterId === refs.chapterId && record.messageId === messageId && record.seq === index);
    if (!point || !checkpoint?.payload?.state || !checkpoint.payload.chat || !checkpoint.payload.config
      || !Storage.validateStory({ ...checkpoint.payload, chat: { ...checkpoint.payload.chat, messages: [] } }))
      fail("這則回覆沒有完整的歷史狀態檢查點，為避免人物與記憶錯亂，無法安全回溯。請選擇較新的回覆。");
    return { refs, point, futureCount: Chat.messages.length - index - 1 };
  };

  const rewind = async index => {
    if (busy) return false;
    const message = Chat.messages?.[Number(index)];
    if (!message?.id || message.role !== "assistant") return false;
    busy = true;
    let original = null;
    let originalRefs = null;
    let switched = false;
    let key = "";
    let previousApi = null;
    try {
      const { refs, point, futureCount } = await preflight(Number(index), message.id);
      if (!window.confirm(`回溯到這則 AI 回覆？\n後續 ${futureCount} 則訊息會保留在原故事線。系統將建立一條新路線，並還原當時的世界、人物與記憶狀態。`)) return false;
      if (App.__requestPending || Chat.summarizing || Chat.messages[index]?.id !== message.id
        || Library.refs().chapterId !== refs.chapterId) fail("故事狀態已改變，請重新執行回溯。");
      original = Storage.loadStory();
      if (!original) fail("無法取得原故事的安全備份，回溯已取消。");
      originalRefs = refs;
      previousApi = App.config?.api || {};
      key = String(previousApi.key || "");
      const label = `回溯 · 第 ${Chat.messages.slice(0, index + 1).filter(item => item.role === "assistant").length} 輪`;
      const save = await Library.createBranch(point.messageId, label);
      if (!save?.state || save._library?.parentChapterId !== refs.chapterId
        || save.chat?.messages?.length !== index + 1 || save.chat.messages[index]?.id !== message.id)
        fail("分支資料檢查未通過，沒有切換故事。");
      if (!Storage.restoreStory(save)) fail("回溯分支已建立，但未能恢復故事。");
      switched = true;
      const safeKey = sameConnection(previousApi, App.config.api) ? key : "";
      App.config.api = Object.assign({}, App.config.api || {}, { key: safeKey });
      if (GameState.current) GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView("chat");
      if (!App.saveStory(false)) fail("回溯分支無法儲存。");
      await Storage.flush();
      if (!await Library.flush()) fail("回溯分支無法寫入故事庫。");
      window.BAORefreshSaveUI?.();
      if (!save.config?.demoMode && !safeKey) window.BAOChatAPISettings?.open?.();
      window.alert("已回溯至指定回覆。原故事線完整保留，可從「故事分支」切換回去。");
      return true;
    } catch (error) {
      // createBranch changes local refs before its write; restore them if a write fails.
      if (originalRefs && !switched) Library.adoptRefs({ _library: originalRefs });
      if (original && originalRefs) {
        try {
          if (!Storage.restoreStory(original)) throw new Error("無法還原原故事。");
          Library.adoptRefs({ _library: originalRefs });
          App.config.api = Object.assign({}, App.config.api || {}, { key: sameConnection(previousApi, App.config.api) ? key : "" });
          if (GameState.current) GameState.current.config = App.config;
          App.saveStory(false);
          await Storage.flush();
          await Library.flush();
          App.renderChatShell(false);
          App.showView("chat");
          window.BAORefreshSaveUI?.();
        } catch (restoreError) { console.error("BAO/LAB rollback recovery failed:", restoreError); }
      }
      window.alert(error?.message || "回溯失敗，原故事沒有被刪除。");
      return false;
    } finally { busy = false; }
  };

  const decorate = () => {
    if (decorating) return;
    decorating = true;
    try {
      document.querySelectorAll('#chat-stream > .message.assistant[data-message-index]').forEach(element => {
        const index = Number(element.dataset.messageIndex);
        const message = Chat.messages?.[index];
        const tools = element.querySelector(".story-message-tools");
        if (!tools || !message?.id || tools.querySelector("[data-story-rollback]")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.storyRollback = message.id;
        button.textContent = "↶ 回溯至此";
        button.title = "建立新路線並還原這一輪的歷史狀態，保留原故事";
        button.addEventListener("click", () => rewind(index));
        tools.appendChild(button);
      });
    } finally { decorating = false; }
  };

  const observer = new MutationObserver(() => queueMicrotask(decorate));
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(decorate, 0);
  window.BAOStoryRollback = { version: 1, preflight, rewind, decorate };
})();