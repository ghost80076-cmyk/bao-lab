(() => {
  "use strict";
  if (window.BAOContentPreferences) return;

  const core = window.BAOContentPreferencesCore;
  if (!core) return;

  const STORAGE_KEY = "yorubay:content-preferences:v1";
  const read = () => {
    try {
      return core.normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch (error) {
      console.warn("YoruBay content preferences could not be read:", error);
      return core.normalize({});
    }
  };

  let state = read();
  const snapshot = () => ({ ...state });
  const applyDocumentState = () => {
    document.documentElement.dataset.adultContent = state.adultContentEnabled ? "enabled" : "hidden";
  };
  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("YoruBay content preferences could not be saved:", error);
    }
  };
  const emit = () => {
    window.dispatchEvent(new CustomEvent("yorubay:content-preferences-changed", {
      detail: snapshot()
    }));
  };

  const setAdultContentEnabled = (enabled, options = {}) => {
    const next = Boolean(enabled);
    const confirmAge = options.confirmAge !== false;
    if (next && !state.adultAgeConfirmed) {
      if (confirmAge) {
        const accepted = window.confirm(
          "開啟後會顯示成人向作品與成人 MOD。\n\n請確認你已年滿 18 歲。這只是年齡自我確認，不是身分驗證。"
        );
        if (!accepted) return false;
      }
      state.adultAgeConfirmed = true;
    }
    state.adultContentEnabled = next;
    persist();
    applyDocumentState();
    emit();
    return true;
  };

  const isAdultContentEnabled = () => state.adultContentEnabled === true;
  const canExpose = item => core.canExpose(item, state);
  const guard = item => {
    if (canExpose(item)) return true;
    const message = "這個內容目前依你的內容顯示設定隱藏。可到「我的 → 內容顯示」調整。";
    if (window.BAOFeedback?.notify) window.BAOFeedback.notify(message, "info");
    else window.alert(message);
    return false;
  };

  window.BAOContentPreferences = Object.freeze({
    get: snapshot,
    isAdultContentEnabled,
    setAdultContentEnabled,
    isAdult: core.isAdult,
    canExpose,
    guard
  });

  applyDocumentState();
})();
