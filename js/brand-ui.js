(() => {
  const DISCORD_INVITE = "https://discord.gg/N3XpAhwTN";
  const DISCORD_ICON = '<img src="assets/discord-mark.svg" width="21" height="21" alt="">';
  const discordLink = (label, className = "brand-discord-cta") => `<a class="${className}" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" aria-label="${label}（另開 Discord 邀請連結）">${DISCORD_ICON}<span>${label}</span></a>`;

  const ensureStyles = () => {
    ["css/brand-home.css", "css/brand-community.css", "css/first-run-desktop.css"].forEach(href => {
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
          <div class="brand-signature"><img src="assets/bao-mark.svg" width="64" height="64" alt=""><span>BAO/LAB<small>包包夜讀書房</small></span></div>
          <div class="brand-kicker">A NIGHT READING ROOM · STORIES LEFT WARM</div>
          <h1>今晚，想走進<br>誰的故事？</h1>
          <p class="brand-intro">包包替你留著一盞燈。</p>
          <p class="brand-lead">挑一個角色，接上自己的 AI，讓故事從今晚開始。第一次只要選角色、連上模型、說出第一句話；想走得更深，再慢慢打開世界、記憶與分支。</p>
          <p class="brand-principles">故事主要保存在此裝置 · 使用自己的連線金鑰（API Key） · 不需註冊 BAO/LAB 帳號</p>
          <div class="brand-actions">
            <button class="primary" data-view="explore">挑一本故事開始</button>
            <a class="brand-first-run" href="quick-start.html">第一次來？三步開始 ↗</a>
            <button id="home-continue" class="secondary hidden">繼續上次故事</button>
            <a class="brand-manual" href="api-guide.html">完整 API 說明 ↗</a>
          </div>
        </div>
        <aside class="brand-status-card brand-identity-card">
          <img class="brand-world-art" src="assets/bao-world-core.webp" width="256" height="256" alt="BAO/LAB 世界核心：紫色星球、環繞軌道與中央微光">
          <span class="status-dot"></span>
          <div class="brand-status-title">SYSTEM READY</div>
          <dl>
            <div><dt>角色數量</dt><dd id="home-character-count">—</dd></div>
            <div><dt>世界模擬</dt><dd>可使用</dd></div>
            <div><dt>遊玩模式</dt><dd>角色互動／世界模擬</dd></div>
            <div><dt>連線方式</dt><dd>自備連線金鑰模式（BYOK）</dd></div>
          </dl>
        </aside>
      </section>
      <section class="brand-reading-intro" aria-labelledby="brand-reading-title">
        <div class="brand-section-mark">01 · STORY FIRST</div>
        <div><p class="brand-kicker">不是另一個聊天視窗</p><h2 id="brand-reading-title">讓一段故事，慢慢長成一個世界。</h2></div>
        <p>角色會留下關係、世界會推進時間、每一段對話都有可以回頭的地方。工具留在需要時才出現，閱讀永遠放在前面。</p>
      </section>
      <section class="brand-chapter-grid" aria-label="BAO/LAB 故事特色">
        <article><span>人物</span><h3>關係會留下痕跡</h3><p>用人物、狀態與關係面板，接住故事裡真正改變過的事。</p></article>
        <article><span>世界</span><h3>時間不必停在原地</h3><p>世界狀態、NPC 與事件可以跟著劇情延續，而不是每一輪重新開始。</p></article>
        <article><span>書頁</span><h3>讀過的篇章都有位置</h3><p>故事書庫、分支與匯出讓你保留選擇；想繼續，就從上次停下的那一頁回來。</p></article>
      </section>
      <section class="brand-closing" aria-labelledby="brand-closing-title">
        <div class="brand-closing-lamp" aria-hidden="true"><img src="assets/bao-bun.svg" width="86" height="86" alt=""></div>
        <div><div class="brand-section-mark">02 · OPEN A STORY</div><h2 id="brand-closing-title">一張角色卡，<br>一段今晚的故事。</h2><p>不需要先記住一堆新名詞。先選你想靠近的角色，其他的，故事會帶你慢慢認識。</p></div>
        <button class="primary" data-view="explore">開始選角色</button>
      </section>
      `;

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
        <div class="brand-kicker">ABOUT BAO/LAB</div>
        <h2>讓故事回到玩家手中</h2>
        <p class="brand-about-lead">你的模型，你的故事，你的世界。</p>
        <section class="brand-about-product" aria-label="BAO/LAB 是什麼">
          <p class="brand-about-focus">角色 · 世界 · 互動 · 自己的 AI</p>
          <p>BAO/LAB 是故事優先保存在本機（Local-first）的 AI 角色扮演與世界模擬工具，採自備連線金鑰模式（BYOK）：你向 AI 服務商取得連線金鑰（API Key），自行選擇模型與費用方案。</p>
          <p>你可以建立角色、探索世界、整理記憶、建立故事分支並匯出備份；故事與選擇由你保留，不必被綁在單一聊天平台。</p>
        </section>
        <div class="brand-kicker brand-creator-kicker">ABOUT THE CREATOR</div>
        <h3>關於班長</h3>
        <div class="creator-copy">
          <p>一開始只是做角色卡。做著做著，開始在意角色聊久了會不會忘記、NPC 能不能有自己的生活、世界能不能不等玩家下指令也繼續走。</p>
          <p>於是一路改提示詞、測試長篇互動、研究世界設定、HTML、角色記憶與 NPC 自主性。很多東西都是先想到一個奇怪的玩法，再想辦法把它真的做出來。</p>
          <p>這裡就是我把那些作品和實驗整理在一起的地方。角色、世界、戀愛、劇情、互動介面都有，也會繼續慢慢增加。</p>
          <p>我比較希望玩家可以選自己想用的模型，所以作品由我整理，連線金鑰（API Key）與模型由玩家自己決定。</p>
        </div>
        <div class="creator-card">
          <div><span>方格子 / DC</span><b>班長</b></div>
          <div><span>LunaTalk</span><b>肉包</b></div>
          <div><span>在做的東西</span><b>角色卡 / 世界模擬 / 長篇敘事 / HTML 互動</b></div>
        </div>
      </section>`;
  };

  const renderCommunityNavigation = () => {
    const nav = document.querySelector(".topbar nav");
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
    box.innerHTML = '<strong>連線金鑰（API Key）就是使用 AI 的鑰匙。</strong> 沒有金鑰？三步驟教學會帶你取得並連接。<br><a href="quick-start.html" target="_blank" rel="noopener noreferrer">第一次玩？看三步驟教學（另開分頁）↗</a> · <a href="api-guide.html" target="_blank" rel="noopener noreferrer">完整連線說明（API）↗</a>';
    step.querySelector("h3")?.insertAdjacentElement("afterend", box);
  };

  const initBrandUI = () => {
    ensureStyles();
    setTimeout(() => {
      setNavLabel("home", "首頁");
      setNavLabel("explore", "作品");
      setNavLabel("about", "關於 BAO/LAB");
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
