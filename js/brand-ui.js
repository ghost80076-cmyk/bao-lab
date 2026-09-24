(() => {
  const DISCORD_INVITE = "https://discord.gg/N3XpAhwTN";
  const DISCORD_ICON = '<img src="assets/discord-mark.svg" width="21" height="21" alt="">';
  const discordLink = (label, className = "brand-discord-cta") => `<a class="${className}" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" aria-label="${label}（另開 Discord 邀請連結）">${DISCORD_ICON}<span>${label}</span></a>`;

  const ensureStyles = () => {
    ["css/brand-home.css", "css/brand-community.css", "css/first-run-desktop.css", "css/bao-cinematic-home.css?v=2"].forEach(href => {
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
      <section class="brand-hero brand-cinematic-hero">
        <div class="brand-hero-copy">
          <div class="brand-signature"><img src="assets/bao-mark.svg" width="64" height="64" alt=""><span>BAO/LAB<small>包包夜讀書房</small></span></div>
          <div class="brand-kicker">CINEMATIC NIGHT · BAO/LAB</div>
          <h1>今晚，想走進<br>誰的故事？</h1>
          <p class="brand-intro">包包替你留著一盞燈。</p>
          <p class="brand-lead">每一張角色卡，都是一段正在等你打開的故事。選一個人，從第一句話開始。</p>
          <div class="brand-actions">
            <button class="primary" data-view="explore">開始探索</button>
            <button id="home-continue" class="secondary hidden">繼續上次故事</button>
            <a class="brand-first-run" href="quick-start.html">第一次來？三步開始 ↗</a>
          </div>
          <a id="bao-home-portrait" class="brand-bao-companion" href="bao-mascot.html" aria-label="認識 BAO/LAB 官方吉祥物包包">
            <img src="assets/bao-human-v2.webp" alt="包包：BAO/LAB 官方吉祥物" width="58" height="76" loading="eager"><span>包包在這裡留燈</span>
          </a>
        </div>
        <button class="brand-feature-stage" id="home-feature-stage" type="button" aria-label="開啟角色：林沉風">
          <img id="home-feature-image" src="https://i.meee.com.tw/UHKTM1O.jpg" alt="林沉風" referrerpolicy="no-referrer">
          <span class="brand-feature-shade"></span>
          <span class="brand-feature-copy"><small>走進他的故事</small><b id="home-feature-name">林沉風</b><em id="home-feature-title">見過黑暗的人</em></span>
        </button>
      </section>
      <section class="brand-home-explore" aria-labelledby="home-explore-title">
        <div class="brand-home-explore-head">
          <div><p class="brand-kicker">OPEN A STORY</p><h2 id="home-explore-title">角色正在等你翻開。</h2><p class="brand-home-count">包包今夜留了 <span id="home-character-count">—</span> 個故事入口</p></div>
          <button class="text-button" id="home-all-works" type="button">查看全部作品 →</button>
        </div>
        <div id="home-character-preview" class="home-character-preview" aria-live="polite"></div>
      </section>
      <section id="home-reading" class="brand-reading-intro" aria-labelledby="home-reading-title">
        <div class="brand-reading-copy">
          <p class="brand-section-mark">01 ／ 翻開一頁</p>
          <h2 id="home-reading-title">留一點安靜，<br>讓故事慢慢發生。</h2>
          <p>讀完這一段，再決定下一句。你可以回看前情、整理重要記憶，讓每一次選擇都有跡可循。</p>
          <p class="brand-reading-footnote">從一句話開始，也可以寫成很長的故事。</p>
        </div>
        <article class="brand-paper-page" aria-labelledby="home-excerpt-title">
          <header><span>閱讀示例</span><span class="brand-page-chapter">第一章</span></header>
          <h3 id="home-excerpt-title">燈還亮著</h3>
          <div class="brand-paper-prose">
            <p>雨聲落在窗沿。你推開門時，他抬了抬眼，將桌上的書籤夾回書裡。</p>
            <p>「今天過得怎麼樣？」</p>
            <p>他沒有催你回答，只把另一張椅子拉開一點。燈光落在空著的那一頁，像是替還沒說出口的話，留了一個位置。</p>
          </div>
          <footer><span>故事停在這裡，等你接下一句。</span><span aria-hidden="true">01</span></footer>
        </article>
      </section>
      <section id="home-library" class="brand-library-intro" aria-labelledby="home-library-title">
        <div class="brand-library-sample" aria-label="故事書庫的章節示例">
          <div class="brand-library-sample-head"><span>故事書庫</span><small>章節示例</small></div>
          <div class="brand-library-book">
            <div class="brand-library-cover"><img id="home-library-cover" src="https://i.meee.com.tw/UHKTM1O.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"></div>
            <div class="brand-library-book-copy"><span>留在書庫的故事</span><h3 id="home-library-story">林沉風</h3><p>每次回來，都有一頁等著你。</p></div>
          </div>
          <ol class="brand-library-chapters">
            <li><span>第一章</span><span>第一次相遇</span></li>
            <li class="brand-chapter-current"><span>第二章</span><span>還沒說完的話</span><small>上次閱讀</small></li>
          </ol>
          <button id="home-library-open" type="button" class="brand-home-link">打開我的故事書庫 <span aria-hidden="true">→</span></button>
        </div>
        <div class="brand-library-copy">
          <p class="brand-section-mark">02 ／ 留住故事</p>
          <h2 id="home-library-title">今晚先讀到這裡。<br>下次，接著寫。</h2>
          <p>把故事與章節留在自己的書庫。回來時繼續，也能保留分支，走向另一種可能。</p>
          <div class="brand-sync-note">
            <h3>換個裝置，接上同一個故事。</h3>
            <p>故事先保存在目前裝置。想在手機與電腦之間接續，可連結自己的 Google 雲端硬碟；換裝置後先同步，再從書庫繼續。</p>
            <button id="home-sync-open" type="button" class="brand-home-link">查看跨裝置同步 <span aria-hidden="true">→</span></button>
            <small>連線金鑰（API Key）不會同步，換裝置時需重新輸入。</small>
          </div>
        </div>
      </section>
      <section id="home-closing" class="brand-closing" aria-labelledby="home-closing-title">
        <img src="assets/bao-bun.svg" class="brand-closing-bao" alt="包包" width="64" height="64" loading="lazy">
        <p class="brand-section-mark">包包替你留著燈</p>
        <h2 id="home-closing-title">下一頁，從你開始。</h2>
        <p>選一個角色，把第一句話留給今晚。</p>
        <div class="brand-closing-actions"><button id="home-start-story" type="button" class="primary">開始故事 <span aria-hidden="true">→</span></button><a class="brand-home-link" href="quick-start.html">第一次來？看三步開始</a></div>
      </section>
      `;

    home.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => App.showView(btn.dataset.view)));
    document.getElementById("home-all-works")?.addEventListener("click", () => App.showView("explore"));
    document.getElementById("home-start-story")?.addEventListener("click", () => App.showView("explore"));
    document.getElementById("home-library-open")?.addEventListener("click", () => {
      if (window.BAOStoryTools?.openLibrary) window.BAOStoryTools.openLibrary();
      else window.alert("故事書庫正在載入，請稍後再試。");
    });
    document.getElementById("home-sync-open")?.addEventListener("click", () => {
      const trigger = document.getElementById("bao-drive-button");
      if (trigger) trigger.click();
      else window.alert("同步功能正在載入，請稍後再試。");
    });
    document.getElementById("home-continue")?.addEventListener("click", () => App.resumeSavedStory?.());
    window.BAORefreshHomeCharacterPreview?.();
    window.BAORefreshSaveUI?.();
  };

  window.BAORefreshHomeCharacterPreview = () => {
    const home = document.getElementById("home-view");
    const preview = document.getElementById("home-character-preview");
    const characters = (App.characters || []).filter(character => character?.category !== "r18");
    if (!home || !preview || !characters.length) return;
    const count = document.getElementById("home-character-count");
    if (count) count.textContent = String(characters.length);
    const featured = characters[0];
    const image = document.getElementById("home-feature-image");
    if (image) { image.src = featured.avatar; image.alt = featured.name; }
    document.getElementById("home-feature-name").textContent = featured.name;
    document.getElementById("home-feature-title").textContent = featured.title || featured.description || "開始這段故事";
    const stage = document.getElementById("home-feature-stage");
    if (stage) {
      stage.setAttribute("aria-label", `開啟角色：${featured.name}`);
      stage.onclick = () => App.openCharacter(featured.id);
    }
    const libraryCover = document.getElementById("home-library-cover");
    if (libraryCover) libraryCover.src = featured.avatar;
    const libraryStory = document.getElementById("home-library-story");
    if (libraryStory) libraryStory.textContent = featured.name;
    preview.innerHTML = characters.slice(0, 4).map(character => `
      <button class="home-character-card" type="button" data-home-character="${App.escapeAttr(character.id)}">
        <img src="${App.escapeAttr(character.avatar)}" alt="${App.escapeAttr(character.name)}" loading="lazy">
        <span><small>ORIGINAL CHARACTER</small><b>${App.escapeHTML(character.title || character.name)}</b></span>
      </button>`).join("");
    preview.querySelectorAll("[data-home-character]").forEach(card => card.addEventListener("click", () => App.openCharacter(card.dataset.homeCharacter)));
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
