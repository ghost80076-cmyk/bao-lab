/* Studio-only helper: inserts author-approved prose into existing profile/lore fields. */
(() => {
  "use strict";
  const core = window.BAONPCPersonalityCore;
  const form = document.getElementById("studio-form");
  const panel = document.getElementById("studio-npc-personality");
  if (!core || !form || !panel || window.BAONPCPersonalityHelper) return;
  const field = name => panel.querySelector('[name="' + name + '"]');
  const status = panel.querySelector("[data-npc-personality-status]");
  const output = panel.querySelector("[data-npc-personality-preview]");
  const read = () => Object.fromEntries(
    ["name", "aliases", "cause", "behavior", "trigger", "cost"]
      .map(name => [name, field("npc_axes_" + name)?.value || ""])
  );
  const destination = () => field("npc_axes_destination")?.value || "lore";
  const preview = () => {
    const result = core.build(read(), destination());
    output.textContent = result;
    output.hidden = false;
    status.textContent = "以下僅供預覽，尚未寫入作品或儲存草稿。";
    return result;
  };
  const apply = () => {
    const targetName = destination() === "profile" ? "profile" : "lore";
    const target = form.elements.namedItem(targetName);
    if (!target) throw new Error("找不到角色卡原有設定欄位。");
    const previous = String(target.value || "");
    const result = core.insert(previous, read(), targetName);
    if (!result.changed) {
      status.textContent = "內容與先前版本相同，沒有重複插入。";
      return;
    }
    if (targetName === "lore" && !result.replaced) {
      const used = (previous.match(/【世界書：/g) || []).length;
      if (used >= 32) throw new Error("原角色卡已達 32 筆按需世界書上限，請先整理。");
    }
    if (result.replaced && !window.confirm("同名人物已有四軸資料。要更新先前由此工具產生的段落嗎？其他作者設定將保持原樣。")) {
      status.textContent = "已取消修改，原內容未更動。";
      return;
    }
    target.value = result.value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    output.textContent = result.text;
    output.hidden = false;
    status.textContent = result.replaced
      ? "已更新該人物的四軸設定，尚未儲存草稿。"
      : targetName === "lore"
        ? "已加入按需世界書：只在人物名字等關鍵字出現時召回。尚未儲存草稿。"
        : "已加入主要角色設定：依作品原有 Prompt 規則使用。尚未儲存草稿。";
  };
  for (const [button, action] of [
    ["[data-npc-personality-preview-button]", preview],
    ["[data-npc-personality-apply-button]", apply]
  ]) {
    panel.querySelector(button)?.addEventListener("click", () => {
      try { action(); }
      catch (error) { status.textContent = "請修正：" + String(error?.message || error); }
    });
  }
  const reset = () => {
    for (const name of ["name", "aliases", "cause", "behavior", "trigger", "cost"]) {
      if (field("npc_axes_" + name)) field("npc_axes_" + name).value = "";
    }
    if (field("npc_axes_destination")) field("npc_axes_destination").value = "lore";
    output.textContent = "";
    output.hidden = true;
    status.textContent = "這是選填工具，不會自行改變角色卡設定。";
  };
  window.BAONPCPersonalityHelper = Object.freeze({ preview, apply, reset });
})();