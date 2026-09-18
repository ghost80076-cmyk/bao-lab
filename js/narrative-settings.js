(() => {
  if (typeof App === "undefined") return;

  const KEY = "bao-lab:narrative-settings-v1";
  const defaults = {
    stylePacks: [],
    density: "card",
    paragraphs: "auto",
    innerThoughts: "card",
    physicalContinuity: false,
    intimacy: "card"
  };

  const packs = {
    female_kfilm: ["女性向 · 韓式電影感", "重視距離、微表情、留白、環境與關係暗流。"],
    male_visual: ["男性向 · 視覺凝視", "重視外觀、服裝、姿態、身體動態與鏡頭焦點。"],
    male_blunt: ["男性向 · 直白粗獷", "口語、直接、可依角色使用粗口；減少委婉隱喻，重視感官、動作與段落節奏。"],
    cinematic: ["電影鏡頭", "用可觀察的動作、空間、聲音與光線組織畫面。"],
    action_realism: ["動作寫實", "重視發力、接觸、受力、平衡與環境反應。"],
    natural: ["自然口語", "降低模板感，讓對白有停頓、打岔與生活感。"]
  };

  const validStylePacks = value => {
    const list = Array.isArray(value) ? value : [];
    return [...new Set(list.filter(key => Object.prototype.hasOwnProperty.call(packs, key)))];
  };

  const normalizePrefs = value => {
    const raw = value && typeof value === "object" ? value : {};
    let stylePacks = validStylePacks(raw.stylePacks);
    if (!stylePacks.length && raw.stylePack && raw.stylePack !== "off" && packs[raw.stylePack]) {
      stylePacks = [raw.stylePack];
    }
    return { ...defaults, ...raw, stylePacks };
  };

  const read = () => {
    try { return normalizePrefs(JSON.parse(localStorage.getItem(KEY) || "{}") || {}); }
    catch { return { ...defaults, stylePacks: [] }; }
  };
  let settings = read();
  const save = () => localStorage.setItem(KEY, JSON.stringify(settings));

  const ensureStyles = () => {
    if (!document.querySelector('link[href="css/narrative-settings.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "css/narrative-settings.css";
      document.head.appendChild(link);
    }
  };

  const close = () => document.querySelector(".bao-modal-backdrop")?.remove();
  const activePrefs = () => {
    const inChat = document.getElementById("chat-view")?.classList.contains("active");
    if (inChat && App.config?.narrative) return normalizePrefs(App.config.narrative);
    return normalizePrefs(settings);
  };

  const worldFocus = () => {
    const raw = App.activeCharacter?.world_focus || [];
    return Array.isArray(raw) ? raw.filter(Boolean).map(String).slice(0, 16) : [];
  };

  const summaryItems = prefs => {
    const normalized = normalizePrefs(prefs);
    const items = normalized.stylePacks.map(key => packs[key]?.[0]).filter(Boolean);
    if (normalized.density !== "card") items.push(normalized.density === "rich" ? "豐富描寫" : normalized.density === "standard" ? "標準描寫" : "精簡描寫");
    if (normalized.paragraphs !== "auto") items.push(`${normalized.paragraphs} 段`);
    if (normalized.innerThoughts !== "card") items.push(normalized.innerThoughts === "none" ? "不揭露內心" : normalized.innerThoughts === "restrained" ? "克制內心戲" : "明確內心戲");
    if (normalized.physicalContinuity) items.push("身體連續性");
    if (normalized.intimacy !== "card") items.push(normalized.intimacy === "fade" ? "親密淡化" : normalized.intimacy === "emotion" ? "親密重情感" : "親密連續描寫");
    return items;
  };

  const updateBuilderSummary = () => {
    const box = document.getElementById("narrative-builder-summary");
    if (!box) return;
    const items = summaryItems(settings);
    box.innerHTML = items.length
      ? items.map(x => `<span class="on">${App.escapeHTML(x)}</span>`).join("")
      : '<span>目前不額外干預角色卡</span>';
    const focusBox = document.getElementById("narrative-builder-focus");
    const focus = worldFocus();
    if (focusBox) {
      focusBox.innerHTML = focus.length ? `<b>這張作品的世界觀焦點</b><div>${focus.map(x => `<span>${App.escapeHTML(x)}</span>`).join("")}</div>` : "";
      focusBox.classList.toggle("hidden", !focus.length);
    }
  };

  const updatePackStatus = wrap => {
    const active = [...wrap.querySelectorAll("[data-style-pack].active")];
    const status = wrap.querySelector("#narrative-pack-status");
    if (!status) return;
    if (!active.length) {
      status.innerHTML = "<strong>目前：</strong>未選擇任何文風包，完全依角色卡。";
      return;
    }
    const names = active.map(btn => packs[btn.dataset.stylePack]?.[0]).filter(Boolean);
    status.innerHTML = `<strong>已選 ${active.length} 個：</strong>${App.escapeHTML(names.join("＋"))}${active.length >= 4 ? "<br>選擇較多風格可能互相拉扯；系統會先合併重複要求，再以角色卡為準。" : ""}`;
  };

  const openModal = () => {
    close();
    const prefs = activePrefs();
    const selected = new Set(prefs.stylePacks);
    const focus = worldFocus();
    const wrap = document.createElement("div");
    wrap.className = "bao-modal-backdrop";
    wrap.innerHTML = `<section class="bao-modal">
      <div class="bao-modal-head"><div><div class="eyebrow">OPTIONAL NARRATIVE LAYER</div><h2>敘事與描寫設定</h2></div><button class="bao-modal-close" type="button">關閉</button></div>
      <div class="bao-modal-body">
        <div class="bao-setting-section">
          <h3>文風包 · 可複選</h3>
          <p>可同時疊加多種效果。未選擇任何項目時完全依角色卡；開啟後系統會合併重複要求，再壓縮成短指令送給模型。</p>
          <div class="narrative-pack-grid">${Object.entries(packs).map(([key, meta]) => `<button type="button" class="narrative-pack ${selected.has(key) ? "active" : ""}" data-style-pack="${key}" aria-pressed="${selected.has(key) ? "true" : "false"}"><b>${App.escapeHTML(meta[0])}</b><span>${App.escapeHTML(meta[1])}</span></button>`).join("")}</div>
          <div id="narrative-pack-status" class="narrative-token-note"></div>
          ${focus.length ? `<div class="narrative-world-focus"><b>作者設定的世界觀焦點</b><div>${focus.map(x => `<span>${App.escapeHTML(x)}</span>`).join("")}</div></div>` : ""}
        </div>

        <div class="bao-setting-section">
          <h3>描寫密度與段落</h3>
          <p>「豐富」不是堆形容詞，而是補足動作、感官、環境、因果與場景後果。</p>
          <div class="narrative-select-grid">
            <label>描寫密度
              <select data-pref="density">
                <option value="card" ${prefs.density === "card" ? "selected" : ""}>依角色卡</option>
                <option value="concise" ${prefs.density === "concise" ? "selected" : ""}>精簡</option>
                <option value="standard" ${prefs.density === "standard" ? "selected" : ""}>標準</option>
                <option value="rich" ${prefs.density === "rich" ? "selected" : ""}>豐富</option>
              </select><small>依角色卡＝不額外加入規則。</small>
            </label>
            <label>每輪大致段落
              <select data-pref="paragraphs">
                <option value="auto" ${prefs.paragraphs === "auto" ? "selected" : ""}>自動 · 依場景</option>
                <option value="2-3" ${prefs.paragraphs === "2-3" ? "selected" : ""}>2–3 段</option>
                <option value="3-5" ${prefs.paragraphs === "3-5" ? "selected" : ""}>3–5 段</option>
                <option value="4-7" ${prefs.paragraphs === "4-7" ? "selected" : ""}>4–7 段</option>
              </select><small>只是節奏目標，不為湊段數重複描寫。</small>
            </label>
          </div>
        </div>

        <div class="bao-setting-section">
          <h3>內心戲</h3>
          <p>只控制 NPC／角色的內在描寫。無論選哪一種，都不得替玩家編造心理。</p>
          <div class="narrative-select-grid">
            <label>內心揭露程度
              <select data-pref="innerThoughts">
                <option value="card" ${prefs.innerThoughts === "card" ? "selected" : ""}>依角色卡</option>
                <option value="none" ${prefs.innerThoughts === "none" ? "selected" : ""}>不揭露 · 只看行為</option>
                <option value="restrained" ${prefs.innerThoughts === "restrained" ? "selected" : ""}>克制揭露</option>
                <option value="clear" ${prefs.innerThoughts === "clear" ? "selected" : ""}>明確揭露</option>
              </select>
            </label>
            <label>親密場景
              <select data-pref="intimacy">
                <option value="card" ${prefs.intimacy === "card" ? "selected" : ""}>依角色卡</option>
                <option value="fade" ${prefs.intimacy === "fade" ? "selected" : ""}>淡化帶過</option>
                <option value="emotion" ${prefs.intimacy === "emotion" ? "selected" : ""}>情感與關係優先</option>
                <option value="continuous" ${prefs.intimacy === "continuous" ? "selected" : ""}>保持連續、不跳步</option>
              </select>
            </label>
          </div>
          <label class="narrative-switch" style="margin-top:12px"><span><b>身體與空間連續性</b><br><small class="note">追蹤位置、姿態、接觸、施力／受力、衣物與環境的前後變化。打鬥與親密互動都適用。</small></span><input type="checkbox" data-pref-check="physicalContinuity" ${prefs.physicalContinuity ? "checked" : ""}></label>
          <div class="narrative-token-note"><strong>Token 原則：</strong>全部維持預設時，不會新增文風 Prompt。即使複選多個文風包，也會先合併與去重，不會直接把多套完整 Prompt 疊上去。</div>
        </div>
      </div>
      <div class="bao-modal-footer"><button class="secondary" type="button" data-narrative-reset>全部恢復預設</button><button class="primary" type="button" data-narrative-save>套用設定</button></div>
    </section>`;
    document.body.appendChild(wrap);

    wrap.querySelector(".bao-modal-close").onclick = close;
    wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
    wrap.querySelectorAll("[data-style-pack]").forEach(btn => btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePackStatus(wrap);
    }));
    updatePackStatus(wrap);

    wrap.querySelector("[data-narrative-reset]").onclick = () => {
      settings = normalizePrefs(defaults);
      save();
      if (document.getElementById("chat-view")?.classList.contains("active") && App.config) {
        App.config.narrative = { ...settings, stylePacks: [...settings.stylePacks] };
        App.saveStory?.(false);
      }
      close();
      updateBuilderSummary();
    };
    wrap.querySelector("[data-narrative-save]").onclick = () => {
      const stylePacks = [...wrap.querySelectorAll("[data-style-pack].active")].map(btn => btn.dataset.stylePack);
      const next = normalizePrefs({ ...defaults, stylePacks });
      wrap.querySelectorAll("[data-pref]").forEach(el => { next[el.dataset.pref] = el.value; });
      wrap.querySelectorAll("[data-pref-check]").forEach(el => { next[el.dataset.prefCheck] = Boolean(el.checked); });
      settings = normalizePrefs(next);
      save();
      if (document.getElementById("chat-view")?.classList.contains("active") && App.config) {
        App.config.narrative = { ...settings, stylePacks: [...settings.stylePacks] };
        App.saveStory?.(false);
      }
      close();
      updateBuilderSummary();
    };
  };

  const buildPreferencePrompt = input => {
    const prefs = normalizePrefs(input);
    const lines = [];
    const selected = new Set(prefs.stylePacks);
    const tones = [];
    const focuses = [];

    if (selected.has("female_kfilm")) {
      tones.push("克制的韓式電影感");
      focuses.push("角色距離、微表情、停頓、關係暗流與對話留白");
    }
    if (selected.has("male_visual")) {
      tones.push("視覺凝視取向");
      focuses.push("外觀、服裝、姿態與身體動態");
    }
    if (selected.has("cinematic")) {
      tones.push("電影鏡頭式");
      focuses.push("可觀察動作、空間、聲音、光線與視線移動");
    }
    if (selected.has("action_realism")) {
      tones.push("動作寫實");
      focuses.push("發力、接觸或著力、力量傳遞、平衡改變與環境後果");
    }
    if (tones.length) {
      lines.push(`融合${tones.join("、")}的敘事取向；重點放在${focuses.join("；")}。相近要求合併處理，不要為了同時呈現多種風格而重複描寫。`);
    }
    if (selected.has("natural")) {
      lines.push("語言與對白保持自然口語，允許停頓、打岔與不完整句，減少模板式華麗修辭。");
    }
    if (selected.has("male_blunt")) {
      lines.push("採用直白粗獷、貼近日常說話的語感；視角色性格可用粗口與短句，避免花俏隱喻和刻意文雅。需要描寫時重視當下可觀察的聲音、神情、距離、動作與段落節奏；不強加於無關場景。親密互動尊重角色的同意與界線，不把拒絕或猶豫擅自改寫成同意。");
    }

    if (prefs.density === "concise") lines.push("描寫精簡，保留推進劇情所需的關鍵動作、對話與反應。");
    if (prefs.density === "standard") lines.push("描寫保持中等密度，兼顧動作、感官、環境與對話，不重複解釋同一資訊。");
    if (prefs.density === "rich") lines.push("描寫密度高；每段承擔不同資訊，補足動作、感官、環境、因果與場景後果，不靠同義詞堆砌篇幅。");

    if (prefs.paragraphs !== "auto") lines.push(`每輪通常以 ${prefs.paragraphs.replace("-", "–")} 段完成；依場景節奏調整，不為湊段數重複內容。`);

    if (prefs.innerThoughts === "none") lines.push("不直接揭露 NPC／角色內心，只從行為、表情、語氣與可觀察反應呈現；不得替玩家描述心理。");
    if (prefs.innerThoughts === "restrained") lines.push("NPC／角色內心只偶爾以短句克制揭露，保留留白；不得替玩家描述心理。");
    if (prefs.innerThoughts === "clear") lines.push("可明確描寫 NPC／角色的內在想法與矛盾，但不得替玩家描述心理、意圖或未說出口的決定。");

    if (prefs.physicalContinuity) lines.push("保持身體與空間連續性：位置、姿態、接觸、施力／受力、衣物與環境變化必須前後有因果，不可無故跳位或重置。");

    if (prefs.intimacy === "fade") lines.push("親密互動可淡化或快速帶過，不要求逐步描寫。");
    if (prefs.intimacy === "emotion") lines.push("親密互動以情緒、信任、距離與關係變化為主，保持必要的動作連續性，不以細節堆疊取代人物關係。");
    if (prefs.intimacy === "continuous") lines.push("親密互動不要無故跳時或省略關鍵轉折；保持距離、姿態、接觸、反應、衣物與場景變化的連續性，並讓角色卡既有的世界觀特徵在相關時自然參與。");

    if (!lines.length) return "";
    lines.push("以上偏好不得破壞角色卡人格、世界規則或既有事實。");
    return `【玩家敘事偏好】\n${lines.join("\n")}`;
  };

  const injectBuilder = () => {
    const step = document.querySelector('[data-step-panel="1"]');
    if (!step || document.getElementById("narrative-builder-card")) return;
    const box = document.createElement("div");
    box.id = "narrative-builder-card";
    box.className = "narrative-builder-card";
    box.innerHTML = `<h4>敘事與描寫偏好 <span class="chip">可選</span></h4><p>預設完全依角色卡。文風包可複選，例如韓式電影感＋電影鏡頭＋自然口語；系統會合併重複要求後再送給模型。</p><div id="narrative-builder-focus" class="narrative-world-focus hidden"></div><div class="narrative-builder-row"><div id="narrative-builder-summary" class="narrative-summary"></div><button type="button" class="secondary" data-open-narrative>設定敘事偏好</button></div>`;
    step.appendChild(box);
    box.querySelector("[data-open-narrative]").onclick = openModal;
    updateBuilderSummary();
  };

  const bindChatButton = () => {
    const row = document.getElementById("bao-player-settings");
    if (!row || row.querySelector("[data-bao-open='narrative']")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary";
    btn.dataset.baoOpen = "narrative";
    btn.textContent = "✦ 敘事與描寫";
    btn.onclick = openModal;
    row.insertBefore(btn, row.firstChild);
  };

  const originalCollect = App.collectConfig.bind(App);
  App.collectConfig = function() {
    const cfg = originalCollect();
    cfg.narrative = { ...settings, stylePacks: [...settings.stylePacks] };
    return cfg;
  };

  const originalBuild = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuild();
    const prefs = normalizePrefs(this.config?.narrative || settings);
    const extra = buildPreferencePrompt(prefs);
    return extra ? `${base}\n\n${extra}` : base;
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    originalRender(fresh);
    setTimeout(bindChatButton, 0);
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function() {
    originalOpenBuilder();
    setTimeout(() => { injectBuilder(); updateBuilderSummary(); }, 0);
  };

  window.BAONarrativeSettings = {
    get: () => ({ ...settings, stylePacks: [...settings.stylePacks] }),
    set: value => { settings = normalizePrefs(value); save(); updateBuilderSummary(); },
    open: openModal,
    buildPrompt: buildPreferencePrompt
  };

  ensureStyles();
  const init = () => { injectBuilder(); bindChatButton(); updateBuilderSummary(); };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 150));
  else setTimeout(init, 150);
})();