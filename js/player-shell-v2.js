/* BAO/LAB Player 2.0 shell.
   Player-facing navigation only: do not move story data, API keys or engine state. */
(() => {
  "use strict";
  if (window.BAOPlayerShellV2 || !window.App) return;

  const MOBILE_BREAKPOINT = 820;
  const ACCOUNT_SESSION_KEY = "yorubay:session";
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const validAccountSession = () => {
    try {
      return /^yb_s_[A-Za-z0-9_-]{30,}$/.test(String(localStorage.getItem(ACCOUNT_SESSION_KEY) || "").trim());
    } catch (_) {
      return false;
    }
  };
  const plainText = value => {
    const node = document.createElement("div");
    node.innerHTML = String(value || "");
    return String(node.textContent || node.innerText || "").replace(/\s+/g, " ").trim();
  };

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/player-shell-v2.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/player-shell-v2.css?v=1";
    document.head.appendChild(link);
  };

  const waitFor = async getter => {
    for (let i = 0; i < 12; i++) {
      const value = getter();
      if (value) return value;
      await wait(100);
    }
    return null;
  };

  const openStoryLibrary = async () => {
    const open = await waitFor(() => window.BAOStoryTools?.openLibrary);
    if (open) return open();
    alert("故事書庫仍在載入，請稍後再試。");
  };

  const openDrive = async () => {
    const button = await waitFor(() => $("bao-drive-button"));
    if (button) return button.click();
    alert("跨裝置同步仍在載入，請稍後再試。");
  };

  const resumeStory = () => {
    if (!window.Storage?.hasStory?.()) {
      App.showView("home");
      return;
    }
    if (typeof App.resumeSavedStory === "function") App.resumeSavedStory();
  };

  const renderMeView = () => {
    if ($("me-view")) return $("me-view");
    const main = document.querySelector(".app-shell > main");
    if (!main) return null;
    const section = document.createElement("section");
    section.id = "me-view";
    section.className = "view";
    section.innerHTML = `
      <div class="bao-player-hub">
        <header class="bao-player-hub-head">
          <div>
            <p class="bao-player-kicker">MY BAO</p>
            <h1>我的</h1>
            <p>故事留在你的裝置；登入只用於你主動使用的線上服務。</p>
          </div>
          <img src="assets/bao-bun.svg" width="72" height="72" alt="包包">
        </header>

        <section class="bao-player-account-card" aria-labelledby="bao-player-account-title">
          <div>
            <span class="bao-player-card-label">ACCOUNT</span>
            <h2 id="bao-player-account-title">帳號與 API 額度</h2>
            <p id="bao-player-account-state">正在確認帳號狀態…</p>
          </div>
          <a class="primary" href="account.html">帳號與額度</a>
        </section>

        <div class="bao-player-grid">
          <section class="bao-player-panel">
            <span class="bao-player-card-label">STORIES</span>
            <h2>我的故事</h2>
            <p id="bao-player-story-state">故事優先保存在目前裝置。</p>
            <div class="bao-player-actions">
              <button class="primary" type="button" data-bao-player-action="stories">打開故事書庫</button>
              <button class="secondary" type="button" data-bao-player-action="resume">繼續最近故事</button>
            </div>
          </section>

          <section class="bao-player-panel">
            <span class="bao-player-card-label">SYNC</span>
            <h2>跨裝置</h2>
            <p>需要時再連結自己的 Google 雲端硬碟。API Key 不會跟著故事同步。</p>
            <button class="secondary" type="button" data-bao-player-action="drive">雲端故事</button>
          </section>

          <section class="bao-player-panel">
            <span class="bao-player-card-label">LOCAL LAB</span>
            <h2>角色實驗室</h2>
            <p>匯入、修改、測試自己的角色卡；草稿仍留在這台裝置。</p>
            <a class="secondary" href="character-studio.html">打開角色實驗室</a>
          </section>

          <section class="bao-player-panel">
            <span class="bao-player-card-label">BAO/LAB</span>
            <h2>作品與說明</h2>
            <p>回到作品區找新的故事，或查看 BAO/LAB 的使用方式與理念。</p>
            <div class="bao-player-actions">
              <button class="secondary" type="button" data-bao-player-action="explore">探索作品</button>
              <button class="secondary" type="button" data-bao-player-action="about">關於 BAO/LAB</button>
            </div>
          </section>
        </div>

        <aside class="bao-player-privacy-note">
          <b>Local-first 仍是預設。</b>
          <span>不登入也能使用 BYOK、本地角色與本地故事；帳號不是讀取私人故事的必要條件。</span>
        </aside>
      </div>`;
    main.appendChild(section);

    section.querySelector('[data-bao-player-action="stories"]')?.addEventListener("click", openStoryLibrary);
    section.querySelector('[data-bao-player-action="resume"]')?.addEventListener("click", resumeStory);
    section.querySelector('[data-bao-player-action="drive"]')?.addEventListener("click", openDrive);
    section.querySelector('[data-bao-player-action="explore"]')?.addEventListener("click", () => App.showView("explore"));
    section.querySelector('[data-bao-player-action="about"]')?.addEventListener("click", () => App.showView("about"));
    return section;
  };

  const refreshMeView = () => {
    renderMeView();
    const account = $("bao-player-account-state");
    if (account) {
      account.textContent = validAccountSession()
        ? "已登入。Hosted 模型與 API 額度會使用目前帳號；BYOK 仍可獨立使用。"
        : "目前未登入。不影響 BYOK、本地故事或角色匯入；需要 Hosted 額度時再登入即可。";
    }

    const storyState = $("bao-player-story-state");
    const resume = document.querySelector('[data-bao-player-action="resume"]');
    const hasStory = Boolean(window.Storage?.hasStory?.());
    if (resume) resume.hidden = !hasStory;
    if (!storyState) return;
    if (!hasStory) {
      storyState.textContent = "這台裝置目前還沒有最近故事。";
      return;
    }

    const save = window.Storage?.loadStory?.();
    const messages = Array.isArray(save?.chat?.messages) ? save.chat.messages : [];
    const last = [...messages].reverse().find(message => String(message?.content || "").trim());
    const name = String(save?.characterName || save?.character?.name || "最近故事").trim();
    const fullPreview = plainText(last?.content);
    const preview = fullPreview.slice(0, 72);
    storyState.textContent = preview ? `${name} · ${preview}${fullPreview.length > 72 ? "…" : ""}` : `${name} · 可以從上次的位置繼續。`;
  };

  const installDesktopEntry = () => {
    const nav = document.querySelector(".topbar nav");
    if (!nav || $("bao-me-nav")) return;
    const button = document.createElement("button");
    button.id = "bao-me-nav";
    button.type = "button";
    button.textContent = "我的";
    button.addEventListener("click", () => App.showView("me"));
    const about = nav.querySelector('[data-view="about"]');
    if (about) nav.insertBefore(button, about);
    else nav.appendChild(button);
  };

  const installMobileNav = () => {
    if ($("bao-mobile-nav")) return;
    const nav = document.createElement("nav");
    nav.id = "bao-mobile-nav";
    nav.className = "bao-mobile-nav";
    nav.setAttribute("aria-label", "主要導覽");
    nav.innerHTML = `
      <button type="button" data-player-nav="home" aria-label="首頁"><span aria-hidden="true">⌂</span><b>首頁</b></button>
      <button type="button" data-player-nav="stories" aria-label="我的故事"><span aria-hidden="true">▤</span><b>故事</b></button>
      <button type="button" data-player-nav="me" aria-label="我的"><span aria-hidden="true">◎</span><b>我的</b></button>`;
    document.body.appendChild(nav);
    nav.querySelector('[data-player-nav="home"]')?.addEventListener("click", () => App.showView("home"));
    nav.querySelector('[data-player-nav="stories"]')?.addEventListener("click", openStoryLibrary);
    nav.querySelector('[data-player-nav="me"]')?.addEventListener("click", () => App.showView("me"));
  };

  const activeView = () => document.querySelector(".app-shell > main > .view.active")?.id?.replace(/-view$/, "") || "home";

  const syncNavigation = view => {
    const current = String(view || activeView());
    const nav = $("bao-mobile-nav");
    const mobile = window.matchMedia(`(max-width:${MOBILE_BREAKPOINT}px)`).matches;
    const hiddenForFlow = ["builder", "chat"].includes(current);
    if (nav) nav.hidden = !mobile || hiddenForFlow;
    document.body.classList.toggle("bao-mobile-nav-visible", Boolean(mobile && !hiddenForFlow));

    const key = current === "me" ? "me"
      : current === "chat" ? "stories"
      : ["home", "explore", "detail"].includes(current) ? "home"
      : "";
    nav?.querySelectorAll("[data-player-nav]").forEach(button => {
      const active = button.dataset.playerNav === key;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    $("bao-me-nav")?.classList.toggle("active", current === "me");
  };

  const patchViews = () => {
    if (App.__baoPlayerShellViewWrapped) return;
    const previous = App.showView.bind(App);
    App.showView = function(view, ...args) {
      const result = previous(view, ...args);
      if (view === "me") refreshMeView();
      syncNavigation(view);
      return result;
    };
    App.__baoPlayerShellViewWrapped = true;
  };

  const init = () => {
    ensureStyles();
    renderMeView();
    installDesktopEntry();
    installMobileNav();
    patchViews();
    refreshMeView();
    syncNavigation();
    window.addEventListener("resize", () => syncNavigation());
    window.addEventListener("storage", event => {
      if (event.key === ACCOUNT_SESSION_KEY) refreshMeView();
    });
  };

  window.BAOPlayerShellV2 = Object.freeze({ refresh: refreshMeView, openStoryLibrary, syncNavigation });
  init();
})();