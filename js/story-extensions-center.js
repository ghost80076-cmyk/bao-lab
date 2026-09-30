(() => {
  "use strict";
  if (window.BAOStoryExtensionsCenter || !window.App || !window.BAOStoryExtensionsCore) return;

  const core = window.BAOStoryExtensionsCore;
  const esc = value => App.escapeHTML(String(value ?? ""));
  const AUTHOR_PREFIX = "bao-lab:author-regex:v1:";
  const close = () => document.querySelector(".story-extensions-backdrop")?.remove();

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/story-extensions-center.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-extensions-center.css";
    document.head.appendChild(link);
  };

  const readAuthorRegex = () => {
    const id = String(App.activeCharacter?.id || "").slice(0, 80);
    if (!id) return {};
    try {
      return JSON.parse(localStorage.getItem(AUTHOR_PREFIX + encodeURIComponent(id)) || "null") || {};
    } catch (_) {
      return {};
    }
  };

  const snapshot = () => {
    let world = [];
    try { world = window.BAOWorldModules?.definitions?.(App.activeCharacter) || []; } catch (_) {}
    let replace = {};
    try { replace = window.BAOPlayerTextReplace?.get?.() || {}; } catch (_) {}
    let regex = {};
    try { regex = window.BAORegex?.load?.() || {}; } catch (_) {}
    const scene = window.BAOSceneHTML?.prefs || { mode: "native", status: "native" };
    return core.overview({
      world,
      scene,
      replace,
      regex,
      authorRegex: readAuthorRegex()
    });
  };

  const focusSceneSettings = () => {
    window.BAOChatToolNavigation?.openDrawer?.();
    window.setTimeout(() => {
      const detail = document.querySelector('[data-chat-tool-group="scene"]');
      if (detail) detail.open = true;
      const control = detail?.querySelector("select,button,input") || document.querySelector("#bao-scene-controls select");
      if (control) {
        control.scrollIntoView({ block: "center", behavior: "smooth" });
        control.focus();
      } else {
        window.BAOFeedback?.notify?.("閱讀排版工具仍在載入，請稍後再試。", "error");
      }
    }, 80);
  };

  const ACTIONS = {
    world() {
      if (window.BAOWorldModuleManager?.open) window.BAOWorldModuleManager.open();
      else window.BAOFeedback?.notify?.("世界模組管理仍在載入。", "error");
    },
    scene() { focusSceneSettings(); },
    replace() {
      const button = document.querySelector('[data-bao-open="text-replace"]');
      if (button) button.click();
      else window.BAOFeedback?.notify?.("文字替換 MOD 仍在載入。", "error");
    },
    regex() {
      window.open("regex-manager.html", "_blank", "noopener");
    }
  };

  const scopeChips = scopes => (Array.isArray(scopes) ? scopes : [])
    .map(scope => `<span class="story-extension-scope">${esc(scope)}</span>`).join("");

  const sourceChips = sources => (Array.isArray(sources) ? sources : [])
    .map(item => {
      const count = item.count === null || item.count === undefined ? "" : ` · ${Number(item.count).toLocaleString()}`;
      return `<span class="story-extension-source" data-source="${esc(item.id || "")}">${esc(item.label)}${esc(count)}</span>`;
    }).join("");

  const ownershipMeta = data => {
    const meta = data?.ownership || {};
    const permissions = Array.isArray(meta.permissions) ? meta.permissions : [];
    return `
      <div class="story-extension-meta">
        <div><b>來源</b><span class="story-extension-sources">${sourceChips(meta.sources)}</span></div>
        <div><b>保存</b><span>${esc(meta.storage || "依工具設定")}</span></div>
        <div><b>適用</b><span>${esc(meta.appliesTo || "目前故事")}</span></div>
        <div><b>啟用</b><span>${esc(meta.control || "玩家決定")}</span></div>
        ${permissions.length ? `<div class="story-extension-permissions"><b>授權</b><span>${permissions.map(item => `<em>${esc(item)}</em>`).join("")}</span></div>` : ""}
      </div>`;
  };

  const card = data => `
    <article class="story-extension-card" data-extension-card="${esc(data.id)}">
      <div class="story-extension-copy">
        <span class="story-extension-eyebrow">${esc(data.eyebrow)}</span>
        <h3>${esc(data.title)}</h3>
        <p>${esc(data.detail)}</p>
        <div class="story-extension-scopes" aria-label="作用範圍">${scopeChips(data.scopes)}</div>
        ${ownershipMeta(data)}
      </div>
      <button type="button" class="secondary" data-extension-action="${esc(data.id)}">${data.id === "regex" ? "開啟工具" : "管理"} →</button>
    </article>`;

  const open = () => {
    if (!window.GameState?.current || !App.activeCharacter) {
      window.BAOFeedback?.notify?.("先進入一個故事，再查看故事擴充。", "error");
      return;
    }
    close();
    ensureStyles();
    const data = snapshot();
    const wrap = document.createElement("div");
    wrap.className = "story-extensions-backdrop";
    wrap.innerHTML = `
      <section class="story-extensions-panel" role="dialog" aria-modal="true" aria-labelledby="story-extensions-title">
        <header class="story-extensions-head">
          <div>
            <div class="eyebrow">STORY EXTENSIONS</div>
            <h2 id="story-extensions-title">故事擴充</h2>
            <p>${esc(data.title)} · <b>${esc(App.activeCharacter?.name || "目前故事")}</b></p>
          </div>
          <button type="button" class="story-extensions-close" data-extension-close aria-label="關閉故事擴充">×</button>
        </header>
        <div class="story-extension-guide">
          <b>先看「作用範圍、來源、保存位置、適用故事與啟用權限」，再決定要不要開。</b>
          <span>世界模組會參與 AI 上下文與狀態；閱讀排版會影響 AI 回覆格式與畫面；玩家文字替換只改顯示。作品 Regex 仍需玩家啟用；若另外允許作者腳本，只會在隔離沙盒中執行，不能自動替玩家送出 API。</span>
        </div>
        <div class="story-extensions-list">
          ${data.cards.map(card).join("")}
        </div>
        <footer class="story-extensions-note">
          <span>「作品提供」代表作品附帶能力，不代表自動取得權限；需要玩家同意的功能仍維持關閉。打開這個頁面本身不會啟用任何規則。</span>
        </footer>
      </section>`;
    document.body.appendChild(wrap);

    wrap.querySelector("[data-extension-close]")?.addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.querySelectorAll("[data-extension-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = ACTIONS[button.dataset.extensionAction];
        if (!action) return;
        close();
        window.setTimeout(action, 0);
      });
    });
    wrap.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    wrap.querySelector("[data-extension-close]")?.focus();
  };

  const summary = () => {
    const data = snapshot();
    return { title: data.title, detail: data.detail };
  };

  window.BAOStoryExtensionsCenter = Object.freeze({ open, close, snapshot, summary });
})();
