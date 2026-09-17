(() => {
  const DISCORD_INVITE = "https://discord.gg/N3XpAhwTN";
  const DISCORD_ICON = '<img src="assets/discord-mark.svg" width="21" height="21" alt="">';
  const discordLink = (label, className = "brand-discord-cta") => `<a class="${className}" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" aria-label="${label}（另開 Discord 邀請連結）">${DISCORD_ICON}<span>${label}</span></a>`;

  const ensureStyles = () => {
    ["css/brand-home.css", "css/brand-community.css"].forEach(href => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
  };

  const setNavLabel = (view, text) => {
    const el = document.querySelector(`.topbar nav [data-view="${view}"]`);
    if (el) el.textContent = text;
  };

  const renderHome = () => {
    const home = document.getElementById("home-view");
    if (!home) return;
    home.innerHTML = `
      <section class="brand-hero">
        <div class="brand-hero-copy">
          <div class="brand-signature"><img src="assets/bao-mark.svg" width="64" height="64" alt=""><span>BAO/LAB<small>班長的故事實驗室</small></span></div>
          <div class="brand-kicker">CHARACTERS · WORLDS · EXPERIMENTS</div>
          <h1>班長。</h1>
          <p class="brand-intro">寫角色，也寫世界。</p>
          <p class="brand-lead">偶爾研究一些奇怪的玩法，然後把它們真的做出來。這裡收著我的角色卡、世界模擬與互動作品；有些適合談戀愛，有些適合跑劇情，有些……滿十八歲再進去。</p>
          <p class="brand-principles">故事保存在此裝置 · 自備 API 與模型 · 不需註冊帳號</p>
          <div class="brand-actions">
            <button class="primary" data-view="explore">探索作品</button>
            ${discordLink("加入官方 Discord", "secondary brand-discord-cta")}
            <button class="secondary" data-view="about">關於我</button>
            <button id="home-continue" class="secondary hidden">繼續上次故事</button>
          </div>
        </div>
        <aside class="brand-status-card brand-identity-card">
          <img class="brand-world-art" src="assets/bao-world-core.webp" width="256" height="256" alt="BAO/LAB 世界核心：紫色星球、環繞軌道與中央微光">
          <span class="status-dot"></span>
          <div class="brand-status-title">SYSTEM READY</div>
          <dl>
            <div><dt>Characters</dt><dd id="home-character-count">—</dd></div>
            <div><dt>World Sim</dt><dd>READY</dd></div>
            <div><dt>Play Mode</dt><dd>Immersive / World</dd></div>
            <div><dt>API</dt><dd>BYOK</dd></div>
          </dl>
        </aside>
      </section>
      <section class="brand-feature-grid">
        <article><span>01</span><h3>角色</h3><p>不只是一張設定表。個性、關係、背景與敘事方式，都是角色的一部分。</p></article>
        <article><span>02</span><h3>世界</h3><p>故事不一定只繞著玩家轉。NPC、事件與關係也可以有自己的變化。</p></article>
        <article><span>03</span><h3>互動</h3><p>除了文字，也嘗試把狀態、人物、事件與各種玩法做進互動介面。</p></article>
        <article><span>04</span><h3>BYOK</h3><p>使用自己的 API 與模型。故事保存在自己的裝置，模型選擇權留給玩家。</p></article>
      </section>
      <section class="brand-product-intro" aria-labelledby="brand-product-intro-title" style="margin:24px 0;padding:clamp(20px,4vw,32px);border:1px solid #444653;border-radius:18px;background:#1c1e27">
        <div class="brand-kicker">ABOUT BAO/LAB</div>
        <h2 id="brand-product-intro-title">讓故事回到玩家手中</h2>
        <p style="font-size:1.15rem;font-weight:700">你的模型，你的故事，你的世界。</p>
        <p>BAO/LAB 是以 Local-first、BYOK 為核心的 AI 角色扮演與世界模擬工具。自由選擇模型，透過故事書庫、記憶整理、故事分支與備份功能，管理並延續你的長篇故事。</p>
        <a class="primary" href="about-bao-lab.html" style="display:inline-block;text-decoration:none;padding:10px 18px;border-radius:10px">了解 BAO/LAB ↗</a>
      </section>
      <section class="brand-api-guide" aria-labelledby="brand-api-guide-title" style="margin:24px 0;padding:24px;border:1px solid #444653;border-radius:18px;background:#1c1e27">
        <div class="brand-kicker">NEW PLAYER GUIDE</div>
        <h2 id="brand-api-guide-title">第一次使用 API？從這裡開始。</h2>
        <p>不需要懂程式。跟著教學了解 API Key、申請 OpenRouter 或 Gemini，再回到 BAO/LAB 開始故事。模型費用與免費額度以服務商公告為準。</p>
        <a class="primary" href="api-guide.html" style="display:inline-block;text-decoration:none;padding:10px 18px;border-radius:10px">查看 API 新手教學 ↗</a>
      </section>
      <section class="brand-contact" aria-labelledby="brand-contact-title">
        <div><div class="brand-kicker">COMMUNITY & CONTACT</div><h2 id="brand-contact-title">聯絡我們</h2><p>使用問題、錯誤回報、功能建議或角色卡交流，歡迎加入 BAO/LAB 官方 Discord。請勿在公開頻道張貼 API Key 或個人資料。</p></div>
        ${discordLink("加入官方 Discord")}
      </section>`;

    home.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => App.showView(btn.dataset.view)));
    document.getElementById("home-continue")?.addEventListener("click", () => App.resumeSavedStory?.());
    const count = document.getElementById("home-character-count");
    if (count) count.textContent = String(App.characters?.length || 0);
    window.BAORefreshSaveUI?.();
  };

  const renderAbout = () => {
    const about = document.getElementById("about-view");
    if (!about) return;
    about.innerHTML = `
      <section class="creator-page">
        <div class="brand-kicker">ABOUT ME</div>
        <h2>關於班長</h2>
        <div class="creator-copy">
          <p>一開始只是做角色卡。做著做著，開始在意角色聊久了會不會忘記、NPC 能不能有自己的生活、世界能不能不等玩家下指令也繼續走。</p>
          <p>於是一路改提示詞、測試長篇互動、研究世界設定、HTML、角色記憶與 NPC 自主性。很多東西都是先想到一個奇怪的玩法，再想辦法把它真的做出來。</p>
          <p>這裡就是我把那些作品和實驗整理在一起的地方。角色、世界、戀愛、劇情、互動介面都有，也會繼續慢慢增加。</p>
          <p>我比較希望玩家可以選自己想用的模型，所以 BAO/LAB 採 BYOK：作品由我整理，API 與模型由玩家自己決定。</p>
        </div>
        <div class="creator-card">
          <div><span>方格子 / DC</span><b>班長</b></div>
          <div><span>LunaTalk</span><b>肉包</b></div>
          <div><span>在做的東西</span><b>角色卡 / 世界模擬 / 長篇敘事 / HTML 互動</b></div>
        </div>
        <section class="brand-contact brand-contact-about" id="contact" aria-labelledby="about-contact-title">
          <div><div class="brand-kicker">CONTACT</div><h3 id="about-contact-title">聯絡我們</h3><p>加入 BAO/LAB 官方 Discord，提出功能建議、回報問題或交流創作。請不要公開 API Key、密碼或私人資料。</p></div>
          ${discordLink("前往官方 Discord")}
        </section>
      </section>`;
  };

  const renderCommunityNavigation = () => {
    const nav = document.querySelector(".topbar nav");
    if (nav && !document.getElementById("bao-discord-nav")) {
      const link = document.createElement("a");
      link.id = "bao-discord-nav";
      link.className = "brand-discord-nav";
      link.href = DISCORD_INVITE;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", "加入 BAO/LAB 官方 Discord（另開分頁）");
      link.innerHTML = `${DISCORD_ICON}<span>Discord</span>`;
      nav.querySelector('[data-view="about"]')?.before(link);
      if (!link.isConnected) nav.appendChild(link);
    }
    if (nav && !document.getElementById("bao-contact-nav")) {
      const contact = document.createElement("button");
      contact.id = "bao-contact-nav";
      contact.type = "button";
      contact.textContent = "聯絡我們";
      contact.addEventListener("click", () => {
        App.showView("about");
        document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.appendChild(contact);
    }
    const footer = document.querySelector(".app-shell > footer");
    if (footer && !document.getElementById("bao-contact-footer")) {
      const contact = document.createElement("span");
      contact.id = "bao-contact-footer";
      contact.innerHTML = `聯絡我們：${discordLink("官方 Discord", "brand-footer-discord")}`;
      footer.appendChild(contact);
    }
  };

  const renderSupport = () => {
    if (document.getElementById("bao-support-float")) return;
    const a = document.createElement("a");
    a.id = "bao-support-float";
    a.className = "bao-support-float";
    a.href = "https://ko-fi.com/roger2486";
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = '<img class="bao-support-icon" src="assets/bao-mark.svg" width="24" height="24" alt=""><span>投餵肉包</span>';
    document.body.appendChild(a);
  };

  const renderAPISetupGuide = () => {
    const step = document.querySelector('[data-step-panel="4"]');
    if (!step || document.getElementById("builder-api-guide")) return;
    const box = document.createElement("div");
    box.id = "builder-api-guide";
    box.className = "note";
    box.style.cssText = "margin:12px 0 18px;padding:14px 16px;border:1px solid #555763;border-radius:12px";
    box.innerHTML = '<strong>第一次使用 API？</strong> 還沒有 Key 也沒關係，先看申請教學，再回來完成設定。<br><a href="api-guide.html" target="_blank" rel="noopener noreferrer">查看 API 新手教學（另開分頁）↗</a>';
    step.querySelector("h3")?.insertAdjacentElement("afterend", box);
  };

  const initBrandUI = () => {
    ensureStyles();
    setTimeout(() => {
      setNavLabel("home", "首頁");
      setNavLabel("explore", "作品");
      setNavLabel("about", "關於我");
      renderHome();
      renderAbout();
      renderCommunityNavigation();
      renderAPISetupGuide();
      renderSupport();
    }, 60);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", initBrandUI);
  else initBrandUI();
})();
