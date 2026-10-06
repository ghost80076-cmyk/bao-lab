(() => {
  const DISCORD_INVITE = "https://discord.gg/N3XpAhwTN";
  const DISCORD_ICON = '<img src="assets/discord-mark.svg" width="21" height="21" alt="">';
  const discordLink = (label, className = "brand-discord-cta") => `<a class="${className}" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" aria-label="${label}（另開 Discord 邀請連結）">${DISCORD_ICON}<span>${label}</span></a>`;
  const nightKey = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  };
  const stableScore = value => {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const nightlyCharacters = characters => [...characters].sort((a, b) =>
    stableScore(nightKey() + ":" + String(a?.id || a?.name || "")) -
    stableScore(nightKey() + ":" + String(b?.id || b?.name || "")));
  const plainStoryText = value => {
    const node = document.createElement("div");
    node.innerHTML = String(value || "");
    return String(node.textContent || node.innerText || "").replace(/\s+/g, " ").trim();
  };
  const usefulState = value => {
    const text = String(value || "").trim();
    return text && !/^(?:未知|未設定|未確認|—|-)$/.test(text) ? text : "";
  };

  const ensureStyles = () => {
    ["css/brand-home.css", "css/brand-community.css", "css/first-run-desktop.css", "css/bao-cinematic-home.css?v=3"].forEach(href => {
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
          <h1>今晚，想走進<br>誰的故事？</h1>
          <p class="brand-intro">替你留了一盞燈。</p>
          <p class="brand-lead">每一個作品，都是一段正在等你打開的故事。選一個故事，從第一句話開始。</p>
          <div class="brand-actions">
            <button class="primary" data-view="explore">開始探索</button>
            <button id="home-continue" class="secondary hidden">繼續閱讀</button>
            <a class="brand-first-run" href="quick-start.html">第一次來？三步開始 ↗</a>
          </div>
          <a id="bao-home-portrait" class="brand-bao-companion" href="bao-mascot.html" aria-label="認識夜灣官方吉祥物包包">
            <img src="assets/bao-human-v2.webp" alt="包包：夜灣官方吉祥物" width="58" height="76" loading="eager"><span>認識包包</span>
          </a>
        </div>
        <button class="brand-feature-stage" id="home-feature-stage" type="button" aria-label="開啟角色：林沉風">
          <img id="home-feature-image" src="https://i.meee.com.tw/UHKTM1O.jpg" alt="林沉風" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer">
          <span class="brand-feature-shade"></span>
          <span class="brand-feature-copy"><small>今晚推薦</small><b id="home-feature-name">林沉風</b><em id="home-feature-title">見過黑暗的人</em></span>
        </button>
      </section>
      <section id="home-local-story" class="brand-local-story hidden" aria-labelledby="home-local-story-title">
        <div class="brand-local-story-cover"><img id="home-local-story-cover" src="assets/bao-mark.svg" alt="" loading="lazy"></div>
        <div class="brand-local-story-copy">
          <p class="brand-section-mark">本機故事</p>
          <span id="home-local-story-time" class="brand-local-story-time">上次閱讀</span>
          <h2 id="home-local-story-title">繼續你的故事</h2>
          <h3 id="home-local-story-name">你的故事</h3>
          <p id="home-local-story-preview">上一次停下來的地方，還替你留著。</p>
          <div id="home-local-story-meta" class="brand-local-story-meta"></div>
          <div class="brand-local-story-actions">
            <button id="home-resume-story" type="button" class="primary">繼續閱讀 <span aria-hidden="true">→</span></button>
            <button id="home-my-stories" type="button" class="brand-home-link">打開我的故事</button>
          </div>
        </div>
      </section>
      <section class="brand-home-explore" aria-labelledby="home-explore-title">
        <div class="brand-home-explore-head">
          <div><h2 id="home-explore-title">更多作品，今晚也在等你。</h2><p class="brand-home-count">今夜有 <span id="home-character-count">—</span> 個故事正在等你。</p></div>
          <button class="text-button" id="home-all-works" type="button">查看全部作品 →</button>
        </div>
        <div id="home-character-preview" class="home-character-preview" aria-live="polite"></div>
      </section>
      <section id="home-reading" class="brand-reading-intro" aria-labelledby="home-reading-title">
        <div class="brand-reading-copy">
          <p class="brand-section-mark">翻開一頁</p>
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
          <footer><span>故事停在這裡，等你接下一句。</span></footer>
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
          <p class="brand-section-mark">留住故事</p>
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
        <p class="brand-section-mark">替你留著燈</p>
        <h2 id="home-closing-title">下一頁，從你開始。</h2>
        <p>選一個作品，把第一句話留給今晚。</p>
        <div class="brand-closing-actions"><button id="home-start-story" type="button" class="primary">開始探索 <span aria-hidden="true">→</span></button></div>
      </section>
      `;

    home.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => App.showView(btn.dataset.view)));
    document.getElementById("home-all-works")?.addEventListener("click", () => App.showView("explore"));
    document.getElementById("home-start-story")?.addEventListener("click", () => App.showView("explore"));
    document.getElementById("home-resume-story")?.addEventListener("click", () => App.resumeSavedStory?.());
    document.getElementById("home-my-stories")?.addEventListener("click", () => {
      if (window.BAOStoryTools?.openLibrary) window.BAOStoryTools.openLibrary();
      else window.alert("我的故事正在載入，請稍後再試。");
    });
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
    window.BAORefreshHomeLocalStory?.();
    window.BAORefreshSaveUI?.();
  };

  window.BAORefreshHomeLocalStory = async () => {
    const section = document.getElementById("home-local-story");
    if (!section || !window.Storage) return;
    await Storage.ready?.();
    const save = Storage.loadStory?.();
    if (!save) {
      section.classList.add("hidden");
      return;
    }
    const character = (App.characters || []).find(card => String(card?.id || "") === String(save.characterId || ""));
    const cover = document.getElementById("home-local-story-cover");
    if (cover) {
      const avatar = character?.avatar || save.character?.avatar || "assets/bao-mark.svg";
      cover.src = avatar;
      cover.alt = (save.characterName || character?.name || "故事") + "封面";
    }
    const name = document.getElementById("home-local-story-name");
    if (name) name.textContent = save.characterName || character?.name || "未命名故事";
    const messages = Array.isArray(save.chat?.messages) ? save.chat.messages : [];
    const last = [...messages].reverse().find(message => String(message?.content || "").trim());
    const preview = document.getElementById("home-local-story-preview");
    if (preview) {
      const text = plainStoryText(last?.content).slice(0, 150);
      preview.textContent = text || "上一次停下來的地方，還替你留著。";
    }
    const saved = new Date(save.savedAt || "");
    const time = document.getElementById("home-local-story-time");
    if (time) time.textContent = Number.isNaN(saved.getTime()) ? "上次閱讀" : "上次閱讀 · " + saved.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const meta = document.getElementById("home-local-story-meta");
    if (meta) {
      const values = [usefulState(save.state?.time), usefulState(save.state?.location)].filter(Boolean);
      meta.replaceChildren(...values.map(value => {
        const span = document.createElement("span");
        span.textContent = value;
        return span;
      }));
    }
    section.classList.remove("hidden");
  };

  window.BAORefreshHomeCharacterPreview = () => {
    const home = document.getElementById("home-view");
    const preview = document.getElementById("home-character-preview");
    const characters = (App.characters || []).filter(character => {
      const preferences = window.BAOContentPreferences;
      if (preferences?.canExpose) return preferences.canExpose(character);
      return String(character?.category || "").toLowerCase() !== "r18"
        && String(character?.rating || "").toLowerCase() !== "adult"
        && character?.adult_content !== true;
    });
    if (!home || !preview || !characters.length) return;
    const nightly = nightlyCharacters(characters);
    const count = document.getElementById("home-character-count");
    if (count) count.textContent = String(characters.length);
    const featured = nightly[0];
    const image = document.getElementById("home-feature-image");
    if (image) { image.src = featured.avatar; image.alt = featured.name; }
    document.getElementById("home-feature-name").textContent = featured.name;
    document.getElementById("home-feature-title").textContent = featured.title || featured.description || "開始這段故事";
    const stage = document.getElementById("home-feature-stage");
    if (stage) {
      stage.setAttribute("aria-label", `今晚推薦：${featured.name}`);
      stage.dataset.homeCharacter = String(featured.id || "");
      stage.onclick = () => App.openCharacter(featured.id);
    }
    const libraryCover = document.getElementById("home-library-cover");
    if (libraryCover) libraryCover.src = featured.avatar;
    const libraryStory = document.getElementById("home-library-story");
    if (libraryStory) libraryStory.textContent = featured.name;
    const moreStories = nightly.filter(character => character !== featured).slice(0, 4);
    preview.innerHTML = moreStories.map(character => `
      <button class="home-character-card" type="button" data-home-character="${App.escapeAttr(character.id)}">
        <img src="${App.escapeAttr(character.avatar)}" alt="${App.escapeAttr(character.name)}" loading="lazy">
        <span><b>${App.escapeHTML(character.title || character.name)}</b></span>
      </button>`).join("");
    preview.querySelectorAll("[data-home-character]").forEach(card => card.addEventListener("click", () => App.openCharacter(card.dataset.homeCharacter)));
  };

  const renderAbout = () => {
    const about = document.getElementById("about-view");
    if (!about) return;
    about.innerHTML = `
      <section class="creator-page">
        <div class="brand-kicker">關於夜灣</div>
        <h2>一開始，我只是想讓故事好好走下去。</h2>
        <p class="brand-about-lead">我曾經也是一個 AI RP 玩家。</p>
        <section class="brand-about-product" aria-label="為什麼有夜灣">
          <p>我遇過失憶、斷線，也看過喜歡我作品的玩家，為了讓故事繼續而付出高得讓我不忍心的費用。</p>
          <p>所以，我開始做夜灣。</p>
          <p class="brand-about-focus">故事可以換模型，但不應該因此失去自己。</p>
          <a class="primary" href="about-bao-lab.html">為什麼有夜灣 →</a>
        </section>
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

  const SUPPORT_CHANNELS = Object.freeze([
    {
      id: "opay",
      label: "歐付寶｜台灣支持",
      note: "台灣付款",
      url: "https://payment.opay.tw/Broadcaster/Donate/1669AF2DA4DAC7850F570F6BC70C42FE"
    },
    {
      id: "kofi",
      label: "Ko-fi｜海外支持",
      note: "海外付款",
      url: "https://ko-fi.com/yorubay"
    }
  ]);

  const ensureSupportPicker = () => {
    let picker = document.getElementById("yorubay-support-picker");
    if (picker) return picker;

    const style = document.createElement("style");
    style.id = "yorubay-support-picker-style";
    style.textContent = `
      #yorubay-support-picker[hidden]{display:none!important}
      #yorubay-support-picker{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:20px}
      #yorubay-support-picker .yb-support-backdrop{position:absolute;inset:0;background:rgba(4,5,8,.72);backdrop-filter:blur(5px)}
      #yorubay-support-picker .yb-support-panel{position:relative;width:min(420px,100%);padding:22px;border:1px solid rgba(214,170,115,.25);border-radius:20px;background:#15161d;box-shadow:0 24px 80px rgba(0,0,0,.48)}
      #yorubay-support-picker .yb-support-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      #yorubay-support-picker h2{margin:3px 0 6px;font-size:22px}
      #yorubay-support-picker p{margin:0;color:#aaa6ad;font-size:13px;line-height:1.7}
      #yorubay-support-picker .yb-support-close{width:34px;height:34px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:#202129;color:#eee;cursor:pointer}
      #yorubay-support-picker .yb-support-options{display:grid;gap:10px;margin-top:18px}
      #yorubay-support-picker .yb-support-option{display:grid;gap:2px;padding:13px 14px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:#1c1d25;color:#f2eee8;text-decoration:none}
      #yorubay-support-picker .yb-support-option:hover{border-color:rgba(214,170,115,.34);background:#24242d}
      #yorubay-support-picker .yb-support-option b{font-size:14px}
      #yorubay-support-picker .yb-support-option span{color:#9f9aa8;font-size:11px}
    `;
    document.head.appendChild(style);

    picker = document.createElement("div");
    picker.id = "yorubay-support-picker";
    picker.hidden = true;
    picker.innerHTML = `
      <div class="yb-support-backdrop" data-support-close></div>
      <section class="yb-support-panel" role="dialog" aria-modal="true" aria-labelledby="yorubay-support-title">
        <div class="yb-support-head">
          <div>
            <div class="eyebrow">SUPPORT</div>
            <h2 id="yorubay-support-title">投餵肉包</h2>
            <p>選擇你方便的支持方式。台灣可使用歐付寶，海外可使用 Ko-fi。</p>
          </div>
          <button class="yb-support-close" type="button" data-support-close aria-label="關閉">×</button>
        </div>
        <div class="yb-support-options">
          ${SUPPORT_CHANNELS.map(channel => `<a class="yb-support-option" href="${channel.url}" target="_blank" rel="noopener noreferrer external"><b>${channel.label}</b><span>${channel.note}</span></a>`).join("")}
        </div>
      </section>`;
    document.body.appendChild(picker);

    picker.addEventListener("click", event => {
      if (event.target.closest("[data-support-close]")) picker.hidden = true;
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !picker.hidden) picker.hidden = true;
    });
    return picker;
  };

  const openSupportPicker = (title = "投餵肉包") => {
    const picker = ensureSupportPicker();
    const heading = picker.querySelector("#yorubay-support-title");
    if (heading) heading.textContent = title;
    picker.hidden = false;
    picker.querySelector(".yb-support-close")?.focus();
  };

  const wireSupportEntries = () => {
    document.querySelectorAll("a").forEach(a => {
      const legacyMeatbun = a.textContent.includes("投餵肉包") && a.href.includes("ko-fi.com/");
      if (!legacyMeatbun && a.dataset.yorubaySupport !== "project") return;
      if (a.dataset.yorubaySupportBound === "1") return;
      a.dataset.yorubaySupport = "project";
      a.dataset.yorubaySupportBound = "1";
      a.href = "#yorubay-support";
      a.removeAttribute("target");
      a.removeAttribute("rel");
      a.addEventListener("click", event => {
        event.preventDefault();
        openSupportPicker("投餵肉包");
      });
    });
  };

  const renderSupport = () => {
    if (!document.getElementById("bao-support-float")) {
      const a = document.createElement("a");
      a.id = "bao-support-float";
      a.className = "bao-support-float";
      a.href = "#yorubay-support";
      a.dataset.yorubaySupport = "project";
      a.setAttribute("aria-label", "投餵肉包・選擇支持方式");
      a.title = "投餵肉包・支持夜灣";
      a.innerHTML = '<img class="bao-support-icon" src="assets/bao-bun.svg" width="24" height="24" alt=""><span>投餵肉包</span>';
      document.body.appendChild(a);
    }
    wireSupportEntries();
  };

  const initBrandUI = () => {
    ensureStyles();
    if (!App.__baoNightHomeRefreshWrapped) {
      const previousShowView = App.showView.bind(App);
      App.showView = function(view, ...args) {
        const result = previousShowView(view, ...args);
        if (view === "home") {
          queueMicrotask(() => {
            window.BAORefreshHomeCharacterPreview?.();
            window.BAORefreshHomeLocalStory?.();
          });
        }
        return result;
      };
      App.__baoNightHomeRefreshWrapped = true;
    }
    if (!window.__baoHomeAdultVisibilityBound) {
      window.addEventListener("yorubay:content-preferences-changed", () => {
        window.BAORefreshHomeCharacterPreview?.();
      });
      window.__baoHomeAdultVisibilityBound = true;
    }
    setTimeout(() => {
      setNavLabel("home", "首頁");
      setNavLabel("explore", "作品");
      setNavLabel("about", "關於夜灣");
      renderHome();
      renderAbout();
      renderCommunityNavigation();
      renderSupport();
    }, 60);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", initBrandUI);
  else initBrandUI();
})();
