(() => {
  const ensureStyles = () => {
    if (document.querySelector('link[href="css/brand-home.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/brand-home.css";
    document.head.appendChild(link);
  };

  const setNavLabel = (view, text) => {
    const el = document.querySelector(`.topbar [data-view="${view}"]`);
    if (el) el.textContent = text;
  };

  const renderHome = () => {
    const home = document.getElementById("home-view");
    if (!home) return;
    home.innerHTML = `
      <section class="brand-hero">
        <div class="brand-hero-copy">
          <div class="brand-kicker">CHARACTERS · WORLDS · EXPERIMENTS</div>
          <h1>不是只讓角色回話，<br>而是讓世界繼續運轉。</h1>
          <p class="brand-lead">班長 / 肉包的 AI 角色與世界實驗室。長篇角色扮演、世界模擬、NPC 自主性、HTML 互動與 BYOK 模型連接。</p>
          <div class="brand-actions">
            <button class="primary" data-view="explore">探索作品</button>
            <button class="secondary" data-view="about">關於作者</button>
            <button id="home-continue" class="secondary hidden">繼續上次故事</button>
          </div>
        </div>
        <aside class="brand-status-card">
          <span class="status-dot"></span>
          <div class="brand-status-title">SYSTEM READY</div>
          <dl>
            <div><dt>Play Mode</dt><dd>Immersive / World Sim</dd></div>
            <div><dt>API</dt><dd>BYOK</dd></div>
            <div><dt>Memory</dt><dd>Configurable</dd></div>
            <div><dt>Characters</dt><dd id="home-character-count">—</dd></div>
          </dl>
        </aside>
      </section>
      <section class="brand-feature-grid">
        <article><span>01</span><h3>自由模型</h3><p>官方 API、自訂中轉站與 OpenAI-compatible 介面預留。</p></article>
        <article><span>02</span><h3>兩種敘事</h3><p>單角色沉浸與世界模擬分開處理，不再把所有規則塞進同一張卡。</p></article>
        <article><span>03</span><h3>玩家 Persona</h3><p>玩家可自訂名稱、性別、身分與關係，讓 AI 更清楚自己正在面對誰。</p></article>
        <article><span>04</span><h3>成本透明</h3><p>逐步加入 Context、Token、快取與費用統計，不讓玩家盲目燒錢。</p></article>
      </section>`;

    home.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => App.showView(btn.dataset.view)));
    document.getElementById("home-continue")?.addEventListener("click", () => App.resumeSavedStory?.());
    document.getElementById("home-character-count").textContent = String(App.characters?.length || 0);
    window.BAORefreshSaveUI?.();
  };

  const renderAbout = () => {
    const about = document.getElementById("about-view");
    if (!about) return;
    about.innerHTML = `
      <section class="creator-page">
        <div class="brand-kicker">ABOUT THE CREATOR</div>
        <h2>關於班長 / 肉包</h2>
        <div class="creator-copy">
          <p>我不是從「我要做 AI 平台」開始的。一開始，只是做角色卡，然後不停遇到問題。</p>
          <p>角色為什麼聊久了會忘記？NPC 為什麼沒有自己的生活？世界為什麼一定要等玩家下指令才會動？</p>
          <p>所以我開始改提示詞、測試長篇互動、研究世界書、HTML、角色記憶與 NPC 自主性。這裡放的，就是一路測試、翻車，再重新做出來的作品。</p>
          <p>BAO/LAB 想做的不是綁住玩家，而是把角色、世界與模型選擇權交回使用者手上。</p>
        </div>
        <div class="creator-card">
          <div><span>方格子</span><b>班長</b></div>
          <div><span>LunaTalk</span><b>肉包</b></div>
          <div><span>作品方向</span><b>角色卡 / 世界模擬 / 長篇敘事 / HTML</b></div>
        </div>
      </section>`;
  };

  const renderSupport = () => {
    if (document.getElementById("bao-support-float")) return;
    const a = document.createElement("a");
    a.id = "bao-support-float";
    a.className = "bao-support-float";
    a.href = "https://ko-fi.com/roger2486";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "☕ 請作者喝咖啡";
    document.body.appendChild(a);
  };

  const refreshCount = () => {
    const el = document.getElementById("home-character-count");
    if (el) el.textContent = String(App.characters?.length || 0);
  };

  window.addEventListener("DOMContentLoaded", () => {
    ensureStyles();
    setTimeout(() => {
      setNavLabel("home", "首頁");
      setNavLabel("explore", "作品");
      setNavLabel("about", "關於我");
      renderHome();
      renderAbout();
      renderSupport();
      refreshCount();
    }, 260);
  });
})();
