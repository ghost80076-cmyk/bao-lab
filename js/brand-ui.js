(() => {
  const ensureStyles = () => {
    if (document.querySelector('link[href="css/brand-home.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/brand-home.css";
    document.head.appendChild(link);
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
          <div class="brand-kicker">CHARACTERS · WORLDS · EXPERIMENTS</div>
          <h1>班長。</h1>
          <p class="brand-intro">寫角色，也寫世界。</p>
          <p class="brand-lead">偶爾研究一些奇怪的玩法，然後把它們真的做出來。這裡收著我的角色卡、世界模擬與互動作品；有些適合談戀愛，有些適合跑劇情，有些……滿十八歲再進去。</p>
          <div class="brand-actions">
            <button class="primary" data-view="explore">探索作品</button>
            <button class="secondary" data-view="about">關於我</button>
            <button id="home-continue" class="secondary hidden">繼續上次故事</button>
          </div>
        </div>
        <aside class="brand-status-card">
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
        <article><span>04</span><h3>BYOK</h3><p>使用自己的 API 與模型。作品留在這裡，模型選擇權留給玩家。</p></article>
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

  const initBrandUI = () => {
    ensureStyles();
    setTimeout(() => {
      setNavLabel("home", "首頁");
      setNavLabel("explore", "作品");
      setNavLabel("about", "關於我");
      renderHome();
      renderAbout();
      renderSupport();
    }, 60);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", initBrandUI);
  else initBrandUI();
})();
