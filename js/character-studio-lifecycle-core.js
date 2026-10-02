(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BAOCharacterStudioLifecycleCore = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const clean = value => String(value ?? "").trim();

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((out, key) => {
      if (key === "source") return out;
      out[key] = stable(value[key]);
      return out;
    }, {});
  }

  function signature(value) {
    try { return JSON.stringify(stable(value || {})); }
    catch (_) { return ""; }
  }

  function sameVersion(current, installed) {
    if (!current || !installed) return false;
    return signature(current) === signature(installed);
  }

  function draftCardBadges(input = {}) {
    const badges = [input.archived === true
      ? { key: "archived", label: "已封存", tone: "muted" }
      : { key: "draft", label: "草稿", tone: "muted" }];
    if (input.installed === true) {
      badges.push(input.synced === true
        ? { key: "local-synced", label: "本機已同步", tone: "good" }
        : { key: "local-outdated", label: "本機待更新", tone: "warn" });
    }
    if (input.publicKnown !== false && input.published === true) {
      badges.push({ key: "published", label: "已公開", tone: "good" });
    }
    return badges;
  }

  function derive(input = {}) {
    const hasDraft = input.hasDraft === true;
    const dirty = input.dirty === true;
    const installed = input.installed === true;
    const synced = input.synced === true;
    const audit = input.audit && typeof input.audit === "object" ? input.audit : {};
    const publicKnown = input.publicKnown !== false;
    const published = input.published === true;

    const draft = dirty
      ? { key: "dirty", label: "尚未儲存修改", tone: "warn" }
      : hasDraft
        ? { key: "saved", label: "草稿已儲存", tone: "good" }
        : { key: "new", label: "新草稿", tone: "muted" };

    const test = !installed
      ? { key: "not-installed", label: "尚未加入我的角色", tone: "muted" }
      : synced
        ? { key: "synced", label: "本機試玩版本已同步", tone: "good" }
        : { key: "outdated", label: "本機試玩版本較舊", tone: "warn" };

    const readiness = (audit.errors || []).length
      ? { key: "blocked", label: "需要修正", tone: "bad" }
      : audit.longFormReady
        ? { key: "long-ready", label: "長篇測試就緒", tone: "good" }
        : audit.ready
          ? { key: "ready", label: "可開始測玩", tone: "good" }
          : { key: "needs-work", label: "建議補強", tone: "warn" };

    const publication = !publicKnown
      ? { key: "unknown", label: "公開狀態暫時無法確認", tone: "muted" }
      : published
        ? { key: "published", label: "已在公開作品庫", tone: "good" }
        : { key: "private", label: "尚未上架", tone: "muted" };

    let next = {
      action: "save",
      label: "先儲存草稿",
      detail: "把目前修改固定成一個本機版本，再進行試玩與檢查。"
    };

    if (!dirty && hasDraft) {
      if (!installed || !synced) {
        next = {
          action: "install",
          label: installed ? "更新本機試玩版本" : "加入我的角色並試玩",
          detail: "這一步只更新你這台裝置的角色庫，不會公開作品。"
        };
      } else if ((audit.errors || []).length || !audit.ready) {
        next = {
          action: "doctor",
          label: "執行 BAO Doctor",
          detail: "先修正結構問題與必要欄位，再準備送審版本。"
        };
      } else if (published) {
        next = {
          action: "published",
          label: "目前公開版本已存在",
          detail: "現行上架端點不允許直接覆蓋既有公開作品；更新／下架流程會另行處理。"
        };
      } else {
        next = {
          action: "export",
          label: "匯出送審 JSON",
          detail: "目前公開上架仍由管理員審核；匯出檔不會自動發布。"
        };
      }
    }

    return { draft, test, readiness, publication, next };
  }

  return Object.freeze({ clean, stable, signature, sameVersion, draftCardBadges, derive });
});
