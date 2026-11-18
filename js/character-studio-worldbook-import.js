/* External worldbook import into the existing character-card initial_state.
   Data stays local; no executable content is rendered or sent during import. */
(() => {
  "use strict";
  const studio = window.BAOCharacterStudio;
  const core = window.YoruWorldbookLibraryCore;
  const button = document.getElementById("studio-import-worldbook");
  const picker = document.getElementById("studio-worldbook-file");
  const status = document.getElementById("studio-worldbook-import-status");
  const list = document.getElementById("studio-worldbook-import-list");
  if (!studio?.addWorldbookPack || !core || !button || !picker || !status || !list) return;

  const message = text => { status.textContent = text; };
  const render = () => {
    const config = studio.getWorldbookLibrary();
    list.replaceChildren();
    for (const pack of config.installed || []) {
      const row = document.createElement("section");
      row.className = "studio-worldbook-pack";
      const heading = document.createElement("strong");
      heading.textContent = pack.meta.name;
      const reviewedCount = pack.entries.filter(entry => entry.review_required).length;
      const info = document.createElement("p");
      info.className = "note";
      info.textContent = pack.entries.length + " 條 · " + reviewedCount +
        " 條外部規則待審 · " + pack.entries.filter(entry => entry.enabled === false).length +
        " 條已停用（不召回）";
      const setting = document.createElement("label");
      setting.className = "studio-worldbook-activation";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = config.enabled.includes(pack.meta.id);
      const text = document.createElement("span");
      text.textContent = "建立新故事時啟用此世界書（其他待審條目仍不會自動載入）";
      setting.append(toggle, text);
      toggle.addEventListener("change", () => {
        try { studio.setWorldbookPackEnabled(pack.meta.id, toggle.checked); }
        catch (error) { message("✕ " + error.message); render(); }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "從角色卡移除";
      remove.addEventListener("click", () => {
        if (!window.confirm("將「" + pack.meta.name + "」從目前角色卡移除？來源檔案不會刪除。")) return;
        try { studio.removeWorldbookPack(pack.meta.id); }
        catch (error) { message("✕ " + error.message); }
      });
      row.append(heading, info, setting, remove);
      if (reviewedCount) {
        const review = document.createElement("details");
        const title = document.createElement("summary");
        title.textContent = "檢查待審規則（" + reviewedCount + " 條）";
        review.append(title);
        for (const entry of pack.entries.filter(item => item.review_required)) {
          const item = document.createElement("details");
          const label = document.createElement("summary");
          label.textContent = entry.title + " · " + entry.keywords.join("、");
          const original = document.createElement("pre");
          original.className = "studio-worldbook-original";
          original.textContent = entry.content;
          const approve = document.createElement("button");
          approve.type = "button";
          approve.className = "secondary";
          approve.textContent = "已閱讀，允許此條在命中時召回";
          approve.addEventListener("click", () => {
            if (!window.confirm("確認已閱讀「" + entry.title + "」的全部原文？\n批准後，如這本世界書在故事中啟用並符合召回條件，條目可能發送至所用 AI 服務商。")) return;
            try { studio.setWorldbookEntryReviewed(pack.meta.id, entry.id); }
            catch (error) { message("✕ " + error.message); }
          });
          item.append(label, original, approve);
          review.append(item);
        }
        row.append(review);
      }
      list.append(row);
    }
  };

  button.addEventListener("click", () => { picker.value = ""; picker.click(); });
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    if (!file) return;
    button.disabled = true;
    try {
      if (file.size > 1600000) throw new Error("世界書 JSON 超過 1.6 MB，不可截斷原文。");
      const raw = JSON.parse(await file.text());
      const pack = raw?.schema === core.SCHEMA
        ? core.normalizePack(raw) : core.migrateLegacy(raw, file.name.replace(/\.json$/i, ""));
      pack.meta.visibility = "private";
      const reviewCount = pack.entries.filter(entry => entry.review_required).length;
      const disabledCount = pack.entries.filter(entry => entry.enabled === false).length;
      const warning = "原平台的觸發範圍、次關鍵字 AND 條件及優先度不保證與夜灣等效，請保留原檔。";
      const consent = "匯入「" + pack.meta.name + "」的 " + pack.entries.length + " 條世界書資料？\n" +
        "待審規則：" + reviewCount + " 條；來源已停用：" + disabledCount + " 條。\n\n" +
        "預設不啟用、不改動原角色設定，也不會自動發送給 AI。\n" + warning;
      if (!window.confirm(consent)) return;
      studio.addWorldbookPack(pack);
      message("✓ 已附加「" + pack.meta.name + "」：" + pack.entries.length + " 條（" +
        reviewCount + " 條待審）。請儲存草稿；" + warning);
    } catch (error) {
      message("✕ 世界書匯入失敗：" + (error?.message || "請確認 JSON 格式。"));
    } finally {
      picker.value = "";
      button.disabled = false;
      render();
    }
  });
  window.addEventListener("bao:character-studio-card-shown", render);
  window.addEventListener("bao:studio-worldbook-changed", render);
  render();
})();
