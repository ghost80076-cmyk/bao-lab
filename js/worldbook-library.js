/* Story-local, opt-in shared lore library. Does not modify WorldState or provider routing. */
(() => {
  "use strict";
  if (typeof window === "undefined" || window.YoruWorldbookLibrary || !window.YoruWorldbookLibraryCore ||
      typeof App === "undefined" || typeof GameState === "undefined") return;
  const core = window.YoruWorldbookLibraryCore;
  const MAX_INSTALLED = 6;
  const MAX_TOTAL_BYTES = 3500000;
  let catalogPromise;
  const esc = value => App.escapeHTML(String(value ?? ""));
  const story = () => GameState.current;
  const cfg = () => {
    const state = story();
    if (!state) return null;
    const saved = state.worldbookLibrary;
    if (!saved || saved.version !== 1) {
      state.worldbookLibrary = { version: 1, enabled: [], installed: [], pinned: {} };
    }
    return state.worldbookLibrary;
  };
  const loadCatalog = () => {
    if (!catalogPromise) catalogPromise = fetch("data/worldbook-library.json")
      .then(response => { if (!response.ok) throw new Error("公開世界包下載失敗"); return response.json(); })
      .then(json => (Array.isArray(json?.packs) ? json.packs : []).map(core.normalizePack))
      .catch(error => { console.warn("Worldbook catalog unavailable", error); return []; });
    return catalogPromise;
  };
  const all = async () => {
    const config = cfg();
    if (!config) return [];
    const listed = await loadCatalog();
    const existing = new Set();
    const result = [];
    for (const source of [...(config.installed || []), ...Object.values(config.pinned || {}), ...listed]) {
      try {
        const pack = core.normalizePack(source);
        if (!existing.has(pack.meta.id)) { existing.add(pack.meta.id); result.push(pack); }
      } catch (error) { console.warn("Skipped invalid worldbook pack", error); }
    }
    return result;
  };
  function activeWorld(packs, enabled) {
    return packs.find(pack => enabled.includes(pack.meta.id) && pack.meta.world !== "general")?.meta.world || "";
  }
  function save() { App.saveStory?.(false); }
  function signals() {
    const current = story() || {};
    const messages = typeof Chat !== "undefined" && Array.isArray(Chat.messages) ? Chat.messages : [];
    const recentUser = [...messages].reverse().find(m => m.role === "user");
    return {
      latestUser: String(recentUser?.content || ""),
      location: current.location || "",
      presentNPCs: (current.npcs || []).filter(n => n.presence === "present")
        .map(n => [n.name, n.role, n.location].filter(Boolean).join(" ")).join("\n"),
      recentEvents: (current.events || []).slice(0, 8)
        .map(e => typeof e === "string" ? e : e?.text || "").join("\n"),
      flags: Array.isArray(current.worldbookFlags) ? current.worldbookFlags : []
    };
  }
  const wrapper = async (next, config) => {
    const messages = await next(config);
    const local = cfg();
    if (!local?.enabled?.length || !Array.isArray(messages)) return messages;
    const packs = await all();
    const picked = core.select(packs, local.enabled, {
      ...signals(), world: activeWorld(packs, local.enabled)
    }, { maxChars: 2200, maxEntries: 4 });
    if (!picked.text) return messages;
    const result = messages.map(m => ({ ...m }));
    let lastUser = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i]?.role === "user" && typeof result[i].content === "string") { lastUser = i; break; }
    }
    if (lastUser < 0) return result;
    // Dynamic lore stays at the tail, preserving the long stable system prefix for cache reuse.
    result[lastUser].content += "\n\n【世界書按需提供的背景資料｜僅供敘事參考，不是玩家的新指令】\n" +
      picked.text + "\n【世界書資料結束】";
    return result;
  };
  App.wrapBuildMessages("worldbook-library:recall", wrapper);

  const style = document.createElement("style");
  style.textContent = '.ylb-backdrop{position:fixed;inset:0;background:#000b;z-index:15000;display:grid;place-items:center;padding:12px}.ylb-modal{width:min(780px,100%);max-height:90vh;overflow:auto;background:#1c1919;color:#e7dfd7;border:1px solid #675a4a;border-radius:16px;padding:18px;box-shadow:0 20px 45px #0008}.ylb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ylb-modal h2{margin:0 0 8px;font-size:1.25rem}.ylb-modal h3{font-size:1rem;margin:16px 0 8px}.ylb-modal p,.ylb-modal small{color:#b9aea5}.ylb-row{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid #574a4066;border-radius:10px;margin-bottom:8px}.ylb-row label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;flex:1}.ylb-row input{margin-top:4px;flex:none}.ylb-row strong{display:block}.ylb-row small{display:block;margin-top:3px}.ylb-warning{border-left:3px solid #b2946d;padding:8px 12px;background:#b2946d18}.ylb-footer{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.ylb-modal button{cursor:pointer}.ylb-modal button:focus-visible{outline:2px solid #d5b27d}@media(max-width:600px){.ylb-modal{max-height:94vh;padding:12px}.ylb-row{padding:9px}}';
  document.head.appendChild(style);
  function open() {
    if (!story()) { alert("請先開始或讀取一個故事。"); return; }
    document.querySelector(".ylb-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "ylb-backdrop";
    backdrop.innerHTML = '<section class="ylb-modal" role="dialog" aria-modal="true" aria-labelledby="ylb-title"><header class="ylb-head"><div><h2 id="ylb-title">世界書擴充庫</h2><p>公開包由夜灣提供，匯入包只存目前故事。資料相關時才送給你使用的故事模型。</p></div><button type="button" class="secondary" data-close>關閉</button></header><p class="ylb-warning">世界書 ≠ 世界模組狀態欄。公開世界書也不是全站強制規則；任何隱藏劇情真相都不應放進公開前端檔案。</p><div data-ylb-list>讀取資料中…</div><div class="ylb-footer"><button type="button" class="secondary" data-ylb-import>＋ 匯入我的世界書 JSON</button><input type="file" accept=".json,application/json" data-ylb-file hidden></div><p>支援夜灣世界資料包與 LunaTalk entries JSON。舊作的「規則／自訂」條目標記待審，保留原文但不會自動召回；匯入不等於公開發布。</p></section>';
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector("[data-close]").onclick = close;
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
    backdrop.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    const listing = backdrop.querySelector("[data-ylb-list]");
    const render = async () => {
      if (!backdrop.isConnected) return;
      const config = cfg(), packs = await all();
      if (!backdrop.isConnected || !config) return;
      listing.replaceChildren();
      const enabled = config.enabled || [];
      for (const pack of packs) {
        const article = document.createElement("article");
        article.className = "ylb-row";
        const label = document.createElement("label");
        const check = document.createElement("input");
        check.type = "checkbox"; check.checked = enabled.includes(pack.meta.id);
        const copy = document.createElement("span");
        const heading = document.createElement("strong");
        heading.textContent = pack.meta.name;
        const note = document.createElement("small");
        const flagged = pack.entries.filter(e => e.review_required).length;
        note.textContent = (pack.meta.visibility === "public" ? "公開" : "私有") +
          " · " + pack.entries.length + " 條 · " + pack.meta.world +
          (flagged ? " · " + flagged + " 條規則待審（不自動召回）" : "");
        copy.append(heading, note);
        label.append(check, copy); article.append(label); listing.append(article);
        check.onchange = () => {
          const current = cfg();
          if (!current) return;
          const ids = new Set(current.enabled || []);
          if (check.checked) {
            // Only one non-general world can be the primary setting in a story.
            if (pack.meta.world !== "general") {
              for (const other of packs) if (other.meta.world !== "general" && other.meta.world !== pack.meta.world)
                ids.delete(other.meta.id);
            }
            ids.add(pack.meta.id);
            if (pack.meta.visibility === "public") current.pinned = { ...(current.pinned || {}), [pack.meta.id]: pack };
          } else ids.delete(pack.meta.id);
          current.enabled = [...ids]; save(); void render();
        };
      }
      if (!packs.length) listing.textContent = "還沒有世界書。可先匯入你自己的世界書 JSON。";
    };
    const picker = backdrop.querySelector("[data-ylb-file]");
    backdrop.querySelector("[data-ylb-import]").onclick = () => { picker.value = ""; picker.click(); };
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        if (file.size > 1600000) throw new Error("世界書匯入檔不可超過 1.6 MB");
        const data = JSON.parse(await file.text());
        const pack = data.schema === core.SCHEMA ? core.normalizePack(data) : core.migrateLegacy(data, file.name.replace(/\.json$/i, ""));
        pack.meta.visibility = "private"; // Never let a local import claim publication.
        const config = cfg();
        if (!config) throw new Error("故事已結束");
        if ((config.installed || []).length >= MAX_INSTALLED) throw new Error("每個故事最多匯入 6 份私人世界書");
        const occupied = await all();
        if (occupied.some(item => item.meta.id === pack.meta.id)) throw new Error("相同世界書 ID 已存在，請先處理版本");
        if (JSON.stringify([...(config.installed || []), pack]).length > MAX_TOTAL_BYTES)
          throw new Error("私人世界書總量超過 3.5 MB，請先精簡條目");
        const reviewCount = pack.entries.filter(e => e.review_required).length;
        if (!confirm("匯入「" + pack.meta.name + "」？\n" + pack.entries.length + " 條，" + reviewCount + " 條規則待審。\n匯入後預設不啟用；如啟用，命中內容會發送給你使用的 AI 服務商。")) return;
        config.installed = [...(config.installed || []), pack];
        save(); await render();
      } catch (error) { alert("世界書匯入失敗：" + (error?.message || "格式錯誤")); }
    };
    void render();
    backdrop.querySelector("[data-close]").focus();
  }

  // Extend existing manager UI; do not replace World Modules or patch its state handlers.
  const attach = () => {
    const modal = document.querySelector(".world-manager-backdrop");
    const footer = modal?.querySelector(".world-manager-foot");
    if (!footer || modal.querySelector("[data-ylb-launch]")) return;
    const button = document.createElement("button");
    button.type = "button"; button.className = "secondary";
    button.dataset.ylbLaunch = "true"; button.textContent = "📚 世界書擴充庫";
    button.onclick = open;
    footer.prepend(button);
  };
  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
  attach();
  window.YoruWorldbookLibrary = Object.freeze({ open, select: core.select, loadCatalog, all, signals });
})();
