(() => {
  "use strict";

  const core = window.BAOCharacterStudioLifecycleCore;
  const studio = window.BAOCharacterStudio;
  const engine = window.CharacterEngine;
  const form = document.getElementById("studio-form");
  if (!core || !studio || !engine || !form || window.BAOCharacterStudioLifecycle) return;

  let publicCatalogPromise = null;
  let scheduled = false;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));

  const publicCatalog = async () => {
    if (publicCatalogPromise) return publicCatalogPromise;
    publicCatalogPromise = (async () => {
      const entries = new Map();
      const officialResponse = await fetch("data/characters.json", { cache: "no-store" });
      if (!officialResponse.ok) throw new Error("official_catalog_unavailable");
      const official = await officialResponse.json();
      if (!Array.isArray(official)) throw new Error("official_catalog_invalid");
      official.forEach(item => {
        if (item?.id) entries.set(String(item.id), { ...item, catalog: "official" });
      });

      const manifestResponse = await fetch("data/character-catalog/community/manifest.json", { cache: "no-store" });
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        for (const page of Array.isArray(manifest?.pages) ? manifest.pages : []) {
          if (!page?.file) continue;
          const response = await fetch(String(page.file), { cache: "no-store" });
          if (!response.ok) continue;
          const list = await response.json();
          if (!Array.isArray(list)) continue;
          list.forEach(item => {
            if (item?.id) entries.set(String(item.id), { ...item, catalog: "community" });
          });
        }
      }
      return entries;
    })().catch(error => {
      console.warn("YoruBay creator public catalog lookup failed:", error);
      return null;
    });
    return publicCatalogPromise;
  };

  const panel = () => {
    let node = document.getElementById("studio-lifecycle");
    if (node) return node;
    node = document.createElement("section");
    node.id = "studio-lifecycle";
    node.className = "studio-lifecycle";
    node.setAttribute("aria-label", "作品生命週期");
    node.innerHTML = `
      <div class="studio-lifecycle-head">
        <div>
          <div class="eyebrow">WORK LIFECYCLE</div>
          <h2>作品生命週期</h2>
          <p>分清楚「正在編輯的草稿」、「這台裝置可試玩的版本」與「公開作品」。本機操作不會自動上架。</p>
        </div>
        <strong id="studio-lifecycle-next-summary" role="status" aria-live="polite">整理中…</strong>
      </div>
      <div class="studio-lifecycle-stages">
        <article data-lifecycle-stage="draft"><span>1</span><div><small>草稿</small><b data-lifecycle-value>—</b></div></article>
        <article data-lifecycle-stage="test"><span>2</span><div><small>本機試玩</small><b data-lifecycle-value>—</b></div></article>
        <article data-lifecycle-stage="readiness"><span>3</span><div><small>完成度</small><b data-lifecycle-value>—</b></div></article>
        <article data-lifecycle-stage="publication"><span>4</span><div><small>公開狀態</small><b data-lifecycle-value>—</b></div></article>
      </div>
      <div class="studio-lifecycle-next">
        <div><small>建議下一步</small><b data-lifecycle-next-label>—</b><p data-lifecycle-next-detail></p></div>
        <button type="button" class="primary" data-lifecycle-next-action>前往下一步</button>
      </div>`;
    form.insertAdjacentElement("beforebegin", node);
    node.querySelector("[data-lifecycle-next-action]")?.addEventListener("click", () => {
      const action = node.dataset.nextAction || "";
      const targets = {
        save: "studio-save-draft",
        install: "studio-install",
        doctor: "studio-doctor",
        export: "studio-export"
      };
      if (targets[action]) document.getElementById(targets[action])?.click();
    });
    return node;
  };

  const auditCurrent = card => {
    try {
      return typeof engine.audit === "function"
        ? engine.audit(studio.toExport(card))
        : { errors: [], ready: Boolean(card?.name && card?.id && card?.system_prompt && card?.greeting), longFormReady: false };
    } catch (_) {
      return { errors: ["角色卡尚未能完成檢查"], ready: false, longFormReady: false };
    }
  };

  const snapshot = async () => {
    await engine.readyCustomLibrary?.();
    const card = studio.readCard();
    const state = studio.getState?.() || { draftId: null, dirty: true, hasDraft: false };
    const installedCard = engine.loadCustom().find(item => item.id === card.id) || null;
    let currentExport = null;
    let installedExport = null;
    try {
      currentExport = studio.toExport(card);
      if (installedCard) installedExport = studio.toExport(installedCard);
    } catch (_) {}
    const catalog = await publicCatalog();
    const publicEntry = catalog?.get(String(card.id || "")) || null;
    const audit = auditCurrent(card);
    return {
      card,
      state,
      installedCard,
      audit,
      publicEntry,
      lifecycle: core.derive({
        hasDraft: state.hasDraft,
        dirty: state.dirty,
        installed: Boolean(installedCard),
        synced: Boolean(installedCard && core.sameVersion(currentExport, installedExport)),
        audit,
        publicKnown: catalog !== null,
        published: Boolean(publicEntry)
      })
    };
  };

  const paintStage = (node, value) => {
    if (!node || !value) return;
    node.dataset.state = value.key;
    node.dataset.tone = value.tone;
    const label = node.querySelector("[data-lifecycle-value]");
    if (label) label.textContent = value.label;
  };

  const refresh = async () => {
    scheduled = false;
    const host = panel();
    const data = await snapshot();
    if (!host.isConnected) return data;

    paintStage(host.querySelector('[data-lifecycle-stage="draft"]'), data.lifecycle.draft);
    paintStage(host.querySelector('[data-lifecycle-stage="test"]'), data.lifecycle.test);
    paintStage(host.querySelector('[data-lifecycle-stage="readiness"]'), data.lifecycle.readiness);
    paintStage(host.querySelector('[data-lifecycle-stage="publication"]'), data.lifecycle.publication);

    const summary = host.querySelector("#studio-lifecycle-next-summary");
    if (summary) summary.textContent = data.publicEntry
      ? "公開作品 · " + (data.audit?.score ?? "—") + "/100"
      : "本機作品 · " + (data.audit?.score ?? "—") + "/100";

    host.dataset.nextAction = data.lifecycle.next.action;
    const nextLabel = host.querySelector("[data-lifecycle-next-label]");
    const nextDetail = host.querySelector("[data-lifecycle-next-detail]");
    const action = host.querySelector("[data-lifecycle-next-action]");
    if (nextLabel) nextLabel.textContent = data.lifecycle.next.label;
    if (nextDetail) nextDetail.textContent = data.lifecycle.next.detail;
    if (action) {
      const actionable = ["save", "install", "doctor", "export"].includes(data.lifecycle.next.action);
      action.hidden = !actionable;
      action.textContent = data.lifecycle.next.label;
    }

    const install = document.getElementById("studio-install");
    if (install) install.textContent = data.installedCard ? "更新我的角色" : "加入我的角色";

    host.title = data.publicEntry?.author
      ? "公開作品作者：" + esc(data.publicEntry.author)
      : "本機作品狀態";
    return data;
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(refresh, 70);
  };

  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
  [
    "studio-save-draft", "studio-install", "studio-new", "studio-import",
    "studio-doctor", "studio-export"
  ].forEach(id => document.getElementById(id)?.addEventListener("click", () => {
    window.setTimeout(schedule, 0);
    window.setTimeout(schedule, 180);
  }));

  const status = document.getElementById("studio-status");
  if (status) new MutationObserver(schedule).observe(status, { childList: true, subtree: true, characterData: true });

  panel();
  schedule();

  window.BAOCharacterStudioLifecycle = Object.freeze({ refresh, snapshot, publicCatalog });
})();
