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
    ["css/brand-home.css", "css/brand-community.css", "css/first-run-desktop.css", "css/bao-cinematic-home.css?v=5"].forEach(href => {
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
    // The final homepage is shipped as HTML, avoiding a second layout on hydration.
    // App.bindNavigation() attaches the initial [data-view] buttons once.
    if (!home.querySelector(".brand-cinematic-hero")) return;

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
      a.innerHTML = '' + window.BAOCharacter.markup('bun', 'bao-support-icon') + '<span>投餵肉包</span>';
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
