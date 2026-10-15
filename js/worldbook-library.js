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
    if (!catalogPromise) catalogPromise = Promise.all([
      fetch("data/worldbook-library.json")
        .then(response => { if (!response.ok) throw new Error("公開世界包下載失敗"); return response.json(); }),
      fetch("data/sunrise-worldbook-library.json")
        .then(response => { if (!response.ok) throw new Error("曙光市世界包下載失敗"); return response.json(); })
        .catch(error => { console.warn("Sunrise catalog unavailable", error); return { packs: [] }; }),
      fetch("data/world-simulator-general-library.json")
        .then(response => { if (!response.ok) throw new Error("通用世界模擬器資料下載失敗"); return response.json(); })
        .catch(error => { console.warn("General simulator catalog unavailable", error); return { packs: [] }; })
    ])
      .then(catalogs => {
        const seen = new Set();
        return catalogs.flatMap(json => Array.isArray(json?.packs) ? json.packs : [])
          .map(core.normalizePack).filter(pack => !seen.has(pack.meta.id) && seen.add(pack.meta.id));
      })
      .catch(error => { console.warn("Worldbook catalog unavailable", error); return []; });
    return catalogPromise;
  };
  const snapshots = config => {
    const result = [], seen = new Set();
    for (const raw of [...(config?.installed || []), ...Object.values(config?.pinned || {})]) {
      try {
        const pack = core.normalizePack(raw);
        if (!seen.has(pack.meta.id)) { seen.add(pack.meta.id); result.push(pack); }
      } catch (error) { console.warn("Skipped invalid story worldbook", error); }
    }
    return result;
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

  const collectionMeta = pack => {
    const rawName = String(pack?.meta?.name || "未命名世界書").trim() || "未命名世界書";
    if (pack?.meta?.visibility !== "public") {
      return {
        key: "private:" + String(pack?.meta?.world || "general"),
        name: "我的世界書",
        chapter: rawName
      };
    }
    const parts = rawName.split("｜").map(part => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      return {
        key: ["public", pack.meta.world || "general", parts[0]].join(":"),
        name: parts[0],
        chapter: parts.slice(1).join("｜")
      };
    }
    return {
      key: ["public", pack?.meta?.world || "general", pack?.meta?.id || rawName].join(":"),
      name: rawName,
      chapter: rawName
    };
  };

  const groupPacks = packs => {
    const groups = new Map();
    for (const pack of Array.isArray(packs) ? packs : []) {
      const meta = collectionMeta(pack);
      if (!groups.has(meta.key)) groups.set(meta.key, { ...meta, packs: [] });
      groups.get(meta.key).packs.push(pack);
    }
    return [...groups.values()];
  };

  function setPackEnabled(pack, checked, packs, expectedStory = story()) {
    if (!expectedStory || story() !== expectedStory || !pack) return false;
    const current = cfg();
    if (!current) return false;
    const ids = new Set(current.enabled || []);
    if (checked) {
      if (pack.meta.world !== "general") {
        for (const other of packs) {
          if (other.meta.world !== "general" && other.meta.world !== pack.meta.world) ids.delete(other.meta.id);
        }
      }
      ids.add(pack.meta.id);
      if (pack.meta.visibility === "public") current.pinned = { ...(current.pinned || {}), [pack.meta.id]: pack };
    } else {
      ids.delete(pack.meta.id);
    }
    current.enabled = [...ids];
    save();
    return true;
  }

  function setCollectionEnabled(group, checked, packs, expectedStory = story()) {
    if (!expectedStory || story() !== expectedStory || !group?.packs?.length) return false;
    const current = cfg();
    if (!current) return false;
    const ids = new Set(current.enabled || []);
    const worlds = new Set(group.packs.map(pack => pack.meta.world).filter(world => world !== "general"));
    if (checked && worlds.size) {
      for (const other of packs) {
        if (other.meta.world !== "general" && !worlds.has(other.meta.world)) ids.delete(other.meta.id);
      }
    }
    for (const pack of group.packs) {
      if (checked) {
        ids.add(pack.meta.id);
        if (pack.meta.visibility === "public") current.pinned = { ...(current.pinned || {}), [pack.meta.id]: pack };
      } else {
        ids.delete(pack.meta.id);
      }
    }
    current.enabled = [...ids];
    save();
    return true;
  }
  function save() { App.saveStory?.(false); }
  function setRecallMode(mode, expectedStory = story()) {
    if (!expectedStory || story() !== expectedStory || !["auto", "scene", "off"].includes(mode)) return false;
    cfg().recallMode = mode;
    save();
    return true;
  }
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
  async function setCondition(packId, flag, known, expectedStory = story()) {
    if (!expectedStory || story() !== expectedStory || typeof known !== "boolean") return false;
    const packs = await all();
    if (story() !== expectedStory) return false;
    const local = cfg();
    const pack = packs.find(item => item.meta.id === packId && local.enabled?.includes(packId));
    if (!pack || !pack.entries.some(entry => !entry.review_required && entry.requires.includes(flag))) return false;
    const flags = new Set(Array.isArray(expectedStory.worldbookFlags) ? expectedStory.worldbookFlags : []);
    if (known) flags.add(flag); else flags.delete(flag);
    expectedStory.worldbookFlags = [...flags];
    save();
    return true;
  }
  const wrapper = async (next, config) => {
    const messages = await next(config);
    const owner = story();
    const local = cfg();
    if (!local?.enabled?.length || !Array.isArray(messages)) return messages;
    const owned = snapshots(local);
    // Embedded companion snapshots work offline and never follow catalog revisions.
    const packs = local.enabled.every(id => owned.some(pack => pack.meta.id === id)) ? owned : await all();
    if (story() !== owner || cfg() !== local) return messages;
    const picked = core.select(packs, local.enabled, {
      ...signals(), world: activeWorld(packs, local.enabled)
    }, { maxChars: 2200, maxEntries: 4, recallMode: local.recallMode });
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
  style.textContent = '.ylb-backdrop{position:fixed;inset:0;background:#000b;z-index:15000;display:grid;place-items:center;padding:12px;overflow:hidden}.ylb-modal{width:min(780px,100%);max-width:100%;max-height:90vh;overflow-y:auto;overflow-x:hidden;background:#1c1919;color:#e7dfd7;border:1px solid #675a4a;border-radius:16px;padding:18px;box-shadow:0 20px 45px #0008}.ylb-modal,.ylb-modal *{box-sizing:border-box}.ylb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}.ylb-modal h2{margin:0 0 8px;font-size:1.25rem}.ylb-modal h3{font-size:1rem;margin:16px 0 8px}.ylb-modal p,.ylb-modal small{color:#b9aea5}.ylb-modal p,.ylb-modal small,.ylb-modal strong,.ylb-modal summary{overflow-wrap:anywhere}.ylb-warning{border-left:3px solid #b2946d;padding:8px 12px;background:#b2946d18}.ylb-collection{border:1px solid #574a4066;border-radius:12px;margin:10px 0;padding:12px;min-width:0}.ylb-collection-head{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;min-width:0}.ylb-collection-head label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;flex:1;min-width:0}.ylb-collection-head input,.ylb-row input{margin-top:4px;flex:none}.ylb-collection-copy{min-width:0}.ylb-collection-copy strong{display:block}.ylb-collection-copy small{display:block;margin-top:3px}.ylb-chapters{width:100%;max-width:100%;margin-top:8px;border-top:1px solid #574a4044;padding-top:8px}.ylb-chapters>summary{cursor:pointer;color:#d7c7b9}.ylb-chapter-list{display:grid;gap:8px;margin-top:8px;min-width:0}.ylb-row{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #574a4055;border-radius:10px;min-width:0;max-width:100%;overflow:hidden;flex-wrap:wrap}.ylb-row label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;flex:1;min-width:0}.ylb-row strong{display:block}.ylb-row small{display:block;margin-top:3px}.ylb-row>div,.ylb-row>label>span{min-width:0}.ylb-condition-list{width:100%;padding-left:28px}.ylb-footer{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.ylb-modal button{cursor:pointer;max-width:100%}.ylb-modal button:focus-visible{outline:2px solid #d5b27d}.worldbook-library-launch{white-space:normal}@media(max-width:600px){.ylb-backdrop{padding:6px}.ylb-modal{width:100%;max-height:94vh;padding:12px}.ylb-collection{padding:10px}.ylb-row{padding:9px}.ylb-condition-list{padding-left:8px}}';
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
    const openedStory = story();
    const openCollections = new Set();
    const openConditions = new Set();
    const controls = document.createElement("label");
    controls.textContent = "世界書召回：";
    const modeSelect = document.createElement("select");
    modeSelect.setAttribute("aria-label", "世界書召回模式");
    for (const [value, label] of [["auto", "自動召回"], ["scene", "僅當前場景"], ["off", "關閉可選召回"]]) {
      const option = document.createElement("option");
      option.value = value; option.textContent = label; modeSelect.append(option);
    }
    modeSelect.value = ["auto", "scene", "off"].includes(cfg().recallMode) ? cfg().recallMode : "auto";
    modeSelect.onchange = () => { setRecallMode(modeSelect.value, openedStory); };
    controls.append(modeSelect);
    const modeHint = document.createElement("details");
    modeHint.className = "ylb-recall-explain";
    const modeSummary = document.createElement("summary");
    modeSummary.textContent = "召回方式與 Token 說明";
    const modeDescription = document.createElement("p");
    modeDescription.textContent = "只影響目前故事的後續請求。自動：玩家輸入與故事訊號；場景：目前地點與在場人物。關閉不移除核心設定、固定背景或已知記憶，也不撤回已送出的資料。檢索在本機執行；召回內容可能增加模型輸入 Token。";
    modeHint.append(modeSummary, modeDescription);
    backdrop.querySelector("[data-ylb-list]").before(controls, modeHint);
    const listing = backdrop.querySelector("[data-ylb-list]");

    // Discovery is presentation-only: the existing collection master checkbox
    // always applies to the full original collection, never search-filtered data.
    let collectionFilter = "all";
    const discovery = document.createElement("section");
    discovery.className = "ylb-discovery";
    discovery.setAttribute("aria-label", "尋找世界書");
    const search = document.createElement("input");
    search.type = "search";
    search.className = "ylb-search";
    search.setAttribute("aria-label", "搜尋世界書主題或章節");
    search.placeholder = "搜尋世界書主題或章節";
    const filters = document.createElement("div");
    filters.className = "ylb-filter-buttons";
    filters.setAttribute("aria-label", "篩選世界書");
    const filterButtons = new Map();
    for (const [value, label] of [["all", "全部"], ["enabled", "已啟用"], ["mine", "我的世界書"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ylb-filter-button";
      button.textContent = label;
      button.dataset.ylbFilter = value;
      button.setAttribute("aria-pressed", String(value === "all"));
      filters.append(button);
      filterButtons.set(value, button);
    }
    const count = document.createElement("p");
    count.className = "ylb-result-count";
    count.setAttribute("role", "status");
    count.setAttribute("aria-live", "polite");
    const empty = document.createElement("p");
    empty.className = "ylb-empty-results";
    empty.hidden = true;
    listing.before(discovery);
    discovery.append(search, filters, count);
    listing.after(empty);
    const updateDiscovery = () => {
      const query = search.value.trim().toLowerCase();
      const sections = [...listing.querySelectorAll(".ylb-collection")];
      let matched = 0;
      const enabledCount = sections.filter(section => section.dataset.ylbEnabled === "true").length;
      for (const section of sections) {
        const byText = !query || (section.dataset.ylbSearch || "").includes(query);
        const byStatus = collectionFilter === "all" ||
          (collectionFilter === "enabled" && section.dataset.ylbEnabled === "true") ||
          (collectionFilter === "mine" && section.dataset.ylbPrivate === "true");
        const visible = byText && byStatus;
        section.hidden = !visible;
        if (visible) {
          matched++;
          if (query && !(section.dataset.ylbTitle || "").includes(query)) {
            const chapters = section.querySelector("details.ylb-chapters");
            if (chapters) chapters.open = true;
          }
        }
      }
      count.textContent = "顯示 " + matched + " / " + sections.length + " 個主題 · " +
        enabledCount + " 個主題已有啟用章節";
      empty.hidden = matched > 0 || sections.length === 0;
      empty.textContent = collectionFilter === "mine" && !query
        ? "這個故事還沒有私人世界書，可使用下方的 JSON 匯入。"
        : "沒有符合條件的主題。試試其他名稱或切回「全部」。";
      for (const [value, button] of filterButtons) button.setAttribute("aria-pressed", String(value === collectionFilter));
    };
    search.addEventListener("input", updateDiscovery);
    for (const [value, button] of filterButtons) button.addEventListener("click", () => {
      collectionFilter = value;
      updateDiscovery();
    });

    const render = async () => {
      if (!backdrop.isConnected) return;
      const config = cfg(), packs = await all();
      if (!backdrop.isConnected || !config || story() !== openedStory) return;
      listing.replaceChildren();
      const enabled = config.enabled || [];
      const renderConditions = (pack, target) => {
        const conditions = [...new Set(pack.entries.filter(entry => !entry.review_required)
          .flatMap(entry => entry.requires))];
        if (!conditions.length) return;
        const details = document.createElement("details");
        details.className = "ylb-condition-list";
        const conditionKey = pack.meta.id;
        details.open = openConditions.has(conditionKey);
        details.addEventListener("toggle", () => {
          if (details.open) openConditions.add(conditionKey);
          else openConditions.delete(conditionKey);
        });
        const summary = document.createElement("summary");
        summary.textContent = "已得知資訊（" + conditions.length + " 項）";
        const hint = document.createElement("p");
        hint.textContent = "僅在故事已揭露後勾選。勾選允許相關背景召回，不會建立事件；取消可停止後續召回，已送出的內容不會撤回。";
        details.append(summary, hint);
        for (const flag of conditions) {
          const row = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = (openedStory.worldbookFlags || []).includes(flag);
          input.dataset.ylbCondition = flag;
          const caption = document.createElement("span");
          caption.textContent = flag;
          row.style.display = "flex"; row.style.gap = "8px";
          row.append(input, caption); details.append(row);
          input.onchange = async () => {
            input.disabled = true;
            try { await setCondition(pack.meta.id, flag, input.checked, openedStory); }
            finally { await render(); }
          };
        }
        target.append(details);
      };

      const renderPack = (pack, group) => {
        const article = document.createElement("article");
        article.className = "ylb-row";
        const label = document.createElement("label");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = enabled.includes(pack.meta.id);
        check.setAttribute("aria-label", pack.meta.name);
        const info = document.createElement("span");
        const heading = document.createElement("strong");
        heading.textContent = group.packs.length > 1 ? collectionMeta(pack).chapter : pack.meta.name;
        const note = document.createElement("small");
        const flagged = pack.entries.filter(entry => entry.review_required).length;
        note.textContent = (pack.meta.visibility === "public" ? "公開" : "只存目前故事") +
          " · " + pack.entries.length + " 條" +
          (flagged ? " · " + flagged + " 條待審，不自動召回" : "");
        info.append(heading, note); label.append(check, info);
        article.append(label);

        if (pack.meta.visibility !== "public") {
          const remove = document.createElement("button");
          remove.type = "button"; remove.className = "secondary"; remove.textContent = "移除";
          remove.onclick = () => {
            if (!confirm("移除私人世界書「" + pack.meta.name + "」？原作品檔案不會受影響。")) return;
            const current = cfg();
            if (!current) return;
            current.installed = (current.installed || []).filter(item => item?.meta?.id !== pack.meta.id);
            current.enabled = (current.enabled || []).filter(id => id !== pack.meta.id);
            save(); void render();
          };
          article.append(remove);
        }
        if (check.checked) renderConditions(pack, article);
        check.onchange = () => {
          setPackEnabled(pack, check.checked, packs, openedStory);
          void render();
        };
        return article;
      };

      for (const group of groupPacks(packs)) {
        const section = document.createElement("section");
        section.className = "ylb-collection";
        section.dataset.ylbTitle = group.name.toLowerCase();
        section.dataset.ylbSearch = (group.name + " " + group.packs.map(pack => pack.meta.name).join(" ")).toLowerCase();
        section.dataset.ylbEnabled = group.packs.some(pack => enabled.includes(pack.meta.id)) ? "true" : "false";
        section.dataset.ylbPrivate = group.packs.some(pack => pack.meta.visibility !== "public") ? "true" : "false";
        const head = document.createElement("div");
        head.className = "ylb-collection-head";
        const label = document.createElement("label");
        const master = document.createElement("input");
        master.type = "checkbox";
        const activeCount = group.packs.filter(pack => enabled.includes(pack.meta.id)).length;
        master.checked = activeCount === group.packs.length && group.packs.length > 0;
        master.indeterminate = activeCount > 0 && activeCount < group.packs.length;
        master.setAttribute("aria-label", (group.packs.length > 1 ? "啟用整本 " : "啟用 ") + group.name);
        const copy = document.createElement("span");
        copy.className = "ylb-collection-copy";
        const title = document.createElement("strong");
        title.textContent = group.name;
        const totalEntries = group.packs.reduce((sum, pack) => sum + pack.entries.length, 0);
        const note = document.createElement("small");
        note.textContent = group.packs.length > 1
          ? activeCount + " / " + group.packs.length + " 章已啟用 · 共 " + totalEntries + " 條資料"
          : (activeCount ? "已啟用" : "未啟用") + " · " + totalEntries + " 條資料";
        copy.append(title, note); label.append(master, copy); head.append(label); section.append(head);

        const details = document.createElement("details");
        details.className = "ylb-chapters";
        details.open = openCollections.has(group.key);
        details.addEventListener("toggle", () => {
          if (details.open) openCollections.add(group.key);
          else openCollections.delete(group.key);
        });
        const summary = document.createElement("summary");
        summary.textContent = group.packs.length > 1 ? "自選章節（" + group.packs.length + "）" : "查看內容";
        details.append(summary);
        const list = document.createElement("div");
        list.className = "ylb-chapter-list";
        for (const pack of group.packs) list.append(renderPack(pack, group));
        details.append(list); section.append(details);

        master.onchange = () => {
          setCollectionEnabled(group, master.checked, packs, openedStory);
          void render();
        };
        listing.append(section);
      }
      if (!packs.length) listing.textContent = "還沒有世界書。可先匯入你自己的世界書 JSON。";
      updateDiscovery();
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

  // Keep the old manager entry for compatibility, but expose Worldbooks directly in the story UI too.
  const attach = () => {
    const modal = document.querySelector(".world-manager-backdrop");
    const footer = modal?.querySelector(".world-manager-foot");
    if (!footer || modal.querySelector("[data-ylb-launch]")) return;
    const button = document.createElement("button");
    button.type = "button"; button.className = "secondary";
    button.dataset.ylbLaunch = "true"; button.textContent = "📚 世界書";
    button.onclick = open;
    footer.prepend(button);
  };

  const injectChatEntry = () => {
    const aside = document.querySelector("#chat-view aside");
    if (!aside || aside.querySelector("[data-open-worldbook-library]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary worldbook-library-launch";
    button.dataset.openWorldbookLibrary = "true";
    button.textContent = "📚 世界書";
    button.title = "選擇世界書、章節或匯入自己的世界書";
    button.addEventListener("click", open);
    const worldManager = aside.querySelector("[data-open-world-manager]");
    const exit = aside.querySelector(".text-button");
    if (worldManager?.parentElement === aside) worldManager.insertAdjacentElement("afterend", button);
    else if (exit?.parentElement === aside) exit.before(button);
    else aside.appendChild(button);
  };

  new MutationObserver(() => {
    attach();
    injectChatEntry();
  }).observe(document.body, { childList: true, subtree: true });
  attach();
  injectChatEntry();
  window.YoruWorldbookLibrary = Object.freeze({ open, select: core.select, loadCatalog, all, signals, setCondition, setRecallMode, groupPacks });
})();
