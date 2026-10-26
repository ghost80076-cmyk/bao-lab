/* Player-facing builder presentation. Existing provider/model/storage logic remains the source of truth. */
(() => {
  "use strict";
  if (window.BAOPlayerBuilderV2 || !window.App) return;

  const HOSTED_PROVIDER = "bao-credits";
  if (!document.querySelector('link[href^="css/player-builder-v2.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/player-builder-v2.css?v=7";
    document.head.appendChild(link);
  }
  const view = document.getElementById("builder-view");
  const step = document.querySelector('.builder-step[data-step-panel="4"]');
  const $ = id => document.getElementById(id);
  if (!view || !step) return;

  let lastByokProvider = "";
  const accountSession = () => {
    try { return /^yb_s_[A-Za-z0-9_-]{30,}$/.test(String(localStorage.getItem("yorubay:session") || "").trim()); }
    catch (_) { return false; }
  };
  const provider = () => $("api-type");
  const model = () => $("model-select");

  const setLabel = (id, text) => {
    const label = $(id)?.closest("label");
    if (!label) return;
    const node = [...label.childNodes].find(item => item.nodeType === Node.TEXT_NODE);
    if (node) node.nodeValue = text;
  };

  const markFields = () => {
    const classes = {
      "api-type": "bao-builder-provider",
      "model-select": "bao-builder-model",
      "api-key": "bao-builder-key",
      "model-id": "bao-builder-technical",
      "base-url": "bao-builder-technical",
      "bao-builder-discovery-protocol": "bao-builder-technical"
    };
    Object.entries(classes).forEach(([id, name]) => $(id)?.closest("label")?.classList.add(name));
    setLabel("api-type", "模型服務");
    setLabel("model-select", "模型");
    setLabel("api-key", "連線金鑰（API Key）");
    setLabel("model-id", "模型代號（進階）");
    setLabel("base-url", "連線網址（進階）");
  };

  const hostedAvailable = () => Boolean(provider()?.querySelector(`option[value="${HOSTED_PROVIDER}"]`));
  const firstByokProvider = () => {
    const options = [...(provider()?.options || [])].map(option => option.value).filter(value => value && value !== HOSTED_PROVIDER);
    return options.includes(lastByokProvider) ? lastByokProvider
      : options.includes("gemini") ? "gemini"
      : options[0] || "";
  };

  const setProvider = value => {
    const select = provider();
    if (!select || !value || ![...select.options].some(option => option.value === value)) return false;
    if (select.value === value) return true;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const route = () => provider()?.value === HOSTED_PROVIDER ? "hosted" : "byok";

  const markConditionalSurfaces = () => {
    const legacyTest = $("test-api")?.parentElement;
    if (legacyTest) legacyTest.classList.add("bao-builder-test-row");
    const demo = $("bao-demo-mode")?.closest(".bao-demo-box") || $("bao-demo-mode")?.closest("label") || $("bao-demo-mode")?.parentElement;
    if (demo) demo.classList.add("bao-builder-demo");
    step.querySelector("[data-relay-probe]")?.closest("section")?.classList.add("bao-relay-probe");
  };

  const sync = () => {
    markFields();
    const current = route();
    const currentProvider = provider()?.value || "custom";
    if (current === "byok" && provider()?.value) lastByokProvider = provider().value;
    view.dataset.baoConnection = current;
    view.dataset.baoProvider = currentProvider;
    markConditionalSurfaces();

    const box = $("bao-connection-mode");
    if (!box) return;
    const hosted = box.querySelector('[data-bao-connection="hosted"]');
    const byok = box.querySelector('[data-bao-connection="byok"]');
    hosted.hidden = !hostedAvailable();
    hosted.setAttribute("aria-pressed", String(current === "hosted"));
    byok.setAttribute("aria-pressed", String(current === "byok"));

    const note = $("bao-connection-note");
    const account = $("bao-connection-account");
    const help = $("bao-connection-help");
    if (current === "hosted") {
      if (note) note.textContent = accountSession()
        ? "已登入。選擇模型後會使用夜灣燈火，不需要自己的連線金鑰。"
        : "先登入夜灣帳號再使用燈火；舊版測試玩家仍可使用既有玩家金鑰。";
      if (account) {
        account.hidden = false;
        account.textContent = accountSession() ? "查看帳號與燈火 →" : "登入／查看我的燈火 →";
      }
      if (help) {
        help.href = "quick-start.html";
        help.textContent = "第一次玩？三步開始 →";
      }
    } else {
      if (note) note.textContent = "使用自己的模型連線；費用與免費額度由你選擇的模型服務計算。";
      if (account) account.hidden = true;
      if (help) {
        help.href = currentProvider === "lmstudio" ? "lm-studio-guide.html" : "api-guide.html";
        help.textContent = currentProvider === "lmstudio" ? "LM Studio 連線教學 →" : "完整連線說明 →";
      }
    }

    const quickIntro = $("bao-quick-intro");
    const progressNote = $("bao-first-run-ai-note");
    if (quickIntro && view.dataset.baoSetup === "quick") {
      if (current === "hosted") {
        quickIntro.textContent = "使用夜灣燈火：選一個可用模型就能開始，不需要自己的連線金鑰。";
        if (progressNote) progressNote.textContent = accountSession() ? "夜灣燈火 · 選模型" : "夜灣燈火 · 先登入";
      } else if (currentProvider === "lmstudio") {
        quickIntro.textContent = "使用本機模型：先在 LM Studio 啟動 Local Server 並開啟 CORS，再從下方讀取本機模型。不需要雲端連線金鑰。";
        if (progressNote) progressNote.textContent = "LM Studio · 本機模型";
      } else {
        quickIntro.innerHTML = '使用自己的模型連線：選模型服務與模型，再貼上相符的連線金鑰。<a href="api-guide.html" target="_blank" rel="noopener noreferrer">連線遇到問題？看完整說明 ↗</a>';
        const providerLabel = provider()?.selectedOptions?.[0]?.textContent?.trim() || "自己的 API";
        if (progressNote) progressNote.textContent = `${providerLabel} · 模型與金鑰`;
      }
    }
  };

  const selectRoute = next => {
    if (next === "hosted") {
      if (!hostedAvailable()) {
        const note = $("bao-connection-note");
        if (note) note.textContent = "夜灣燈火仍在載入，請稍後再試。";
        return;
      }
      setProvider(HOSTED_PROVIDER);
    } else if (provider()?.value === HOSTED_PROVIDER || !provider()?.value) {
      setProvider(firstByokProvider());
    }
    sync();
  };


  // Bao guided setup translates existing builder controls into player language.
  // It never stores API keys and never creates a second source of truth.
  const GUIDE_KEY = "yorubay:bao-guided-setup:v1";
  const guideSession = { connectionChoice: "", providerChoice: "" };
  const guideDismissed = () => {
    try { return localStorage.getItem(GUIDE_KEY) === "dismissed"; }
    catch (_) { return false; }
  };
  const setGuideDismissed = value => {
    try {
      if (value) localStorage.setItem(GUIDE_KEY, "dismissed");
      else localStorage.removeItem(GUIDE_KEY);
    } catch (_) {}
  };
  const activeBuilderStep = () => Number(
    [...document.querySelectorAll(".builder-step")]
      .find(panel => panel.classList.contains("active"))?.dataset.stepPanel || App.currentStep || 4
  );
  const chooseRadio = (name, value) => {
    const input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (!input) return false;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const choosePreset = predicate => {
    const preset = (App.modelPresets || []).find(predicate);
    if (!preset) return false;
    if (!setProvider(preset.provider)) return false;
    const index = App.modelPresets.indexOf(preset);
    const select = model();
    if (!select || index < 0) return false;
    select.value = String(index);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const chooseFriendlyProvider = value => {
    guideSession.connectionChoice = "byok";
    guideSession.providerChoice = value;
    selectRoute("byok");
    if (value === "gemini") {
      choosePreset(item => item.provider === "gemini" && item.registry_id === "gemini-3.8-flash" && item.model && item.base_url)
        || choosePreset(item => item.provider === "gemini" && /flash/i.test(String(item.label || item.model)) && item.model && item.base_url)
        || setProvider("gemini");
    } else if (value === "openrouter") {
      choosePreset(item => item.provider === "openrouter" && item.registry_id === "gemini-3.8-flash" && item.model && item.base_url)
        || choosePreset(item => item.provider === "openrouter" && item.model && item.base_url)
        || setProvider("openrouter");
    } else {
      const details = $("api-advanced-settings");
      if (details) details.open = true;
    }
    sync();
    setTimeout(() => $("api-key")?.focus(), 0);
  };
  const guideReady = () => $("bao-start-readiness")?.dataset.ready === "true";
  const guideAvatar = () => window.BAOCharacter?.markup
    ? window.BAOCharacter.markup("bun", "bao-guide-avatar")
    : '<span class="bao-guide-fallback" aria-hidden="true">🏮</span>';
  const guideActions = items => items.filter(Boolean).join("");
  const renderGuide = () => {
    const root = $("bao-guided-setup");
    const reopen = $("bao-guide-reopen");
    if (!root || !reopen) return;
    const dismissed = guideDismissed();
    root.hidden = dismissed;
    reopen.hidden = !dismissed;
    if (dismissed) return;

    const copy = root.querySelector("[data-bao-guide-copy]");
    const actions = root.querySelector("[data-bao-guide-actions]");
    const eyebrow = root.querySelector("[data-bao-guide-eyebrow]");
    const setup = view.dataset.baoSetup || "quick";
    const stepNumber = activeBuilderStep();
    root.dataset.step = String(stepNumber);

    if (setup !== "quick" && stepNumber !== 4) {
      const advanced = {
        1: {
          eyebrow: "包包帶路 · 1 / 5",
          copy: "第一次玩可以先用「單角色沉浸」。它比較像一般角色聊天；之後想讓 NPC 與事件自己跑，再換世界模擬。",
          actions: guideActions([
            '<button type="button" class="primary" data-bao-guide="recommend-step">用推薦設定，下一步</button>',
            '<button type="button" class="secondary" data-bao-guide="dismiss">我自己選</button>'
          ])
        },
        2: {
          eyebrow: "包包帶路 · 2 / 5",
          copy: "顯示方式不會改變角色設定。先用純文本最簡單；想看人物、狀態與事件面板再選互動 UI。",
          actions: guideActions([
            '<button type="button" class="primary" data-bao-guide="recommend-step">先用純文本，下一步</button>',
            '<button type="button" class="secondary" data-bao-guide="dismiss">我自己選</button>'
          ])
        },
        3: {
          eyebrow: "包包帶路 · 3 / 5",
          copy: "玩家資料不用一次填完。名稱最重要，其他像身分、個性、初始關係都可以先留白，進故事後再調整。",
          actions: guideActions([
            '<button type="button" class="primary" data-bao-guide="focus-name">先填名字</button>',
            '<button type="button" class="secondary" data-bao-guide="next-step">先跳過其他欄位</button>'
          ])
        },
        5: {
          eyebrow: "包包帶路 · 5 / 5",
          copy: "記憶先選「平衡」就好。Token、整理輪數和快取都是進階項目，不需要現在理解。",
          actions: guideActions([
            '<button type="button" class="primary" data-bao-guide="recommend-step">使用平衡設定</button>',
            '<button type="button" class="secondary" data-bao-guide="dismiss">我自己調整</button>'
          ])
        }
      }[stepNumber];
      if (advanced) {
        eyebrow.textContent = advanced.eyebrow;
        copy.textContent = advanced.copy;
        actions.innerHTML = advanced.actions;
        return;
      }
    }

    eyebrow.textContent = setup === "quick" ? "包包帶路 · 模型連線" : "包包帶路 · 4 / 5";
    const currentRoute = route();
    const hasKey = Boolean(String($("api-key")?.value || "").trim());
    const currentProvider = provider()?.value || "";
    const currentProviderLabel = provider()?.selectedOptions?.[0]?.textContent?.trim() || "目前服務";

    if (!guideSession.connectionChoice) {
      copy.textContent = "不用先懂 API。告訴我你平常比較習慣哪一種，我會直接替你切到夜灣原本的設定，不會建立另一套資料。";
      actions.innerHTML = guideActions([
        hostedAvailable() ? '<button type="button" class="primary" data-bao-guide="route-hosted"><b>我只想儲值就玩</b><span>最像一般聊天平台 · 使用夜灣燈火</span></button>' : "",
        '<button type="button" class="secondary" data-bao-guide="route-byok"><b>我有 API Key</b><span>使用自己的 Gemini、OpenRouter 等服務</span></button>',
        '<button type="button" class="ghost" data-bao-guide="dismiss">我知道怎麼設定</button>'
      ]);
      return;
    }

    if (guideSession.connectionChoice === "hosted" || currentRoute === "hosted") {
      if (accountSession()) {
        copy.textContent = "這條就是最接近「儲值後直接聊」的方式：你已登入夜灣帳號，不需要 API Key。模型先維持目前選擇就能繼續。";
        actions.innerHTML = guideActions([
          guideReady()
            ? '<button type="button" class="primary" data-bao-guide="start-story">設定好了，開始故事</button>'
            : '<button type="button" class="primary" data-bao-guide="check-ready">檢查還缺什麼</button>',
          '<button type="button" class="secondary" data-bao-guide="route-byok">改用自己的 API</button>'
        ]);
      } else {
        copy.textContent = "這條最像一般儲值平台：先登入夜灣帳號，再使用燈火生成；不用申請或貼 API Key。";
        actions.innerHTML = guideActions([
          '<a class="primary" href="account.html">登入／查看我的燈火 →</a>',
          '<button type="button" class="secondary" data-bao-guide="route-byok">我其實有 API Key</button>'
        ]);
      }
      return;
    }

    if (guideSession.connectionChoice === "byok" && !guideSession.providerChoice) {
      copy.textContent = "好，那只要告訴我你的 Key 是哪一家。第一次接 API 我推薦 Google Gemini；如果你已經有 OpenRouter，就選 OpenRouter。";
      actions.innerHTML = guideActions([
        '<button type="button" class="primary" data-bao-guide="provider-gemini"><b>Google Gemini</b><span>第一次接 API 推薦</span></button>',
        [...(provider()?.options || [])].some(option => option.value === "openrouter")
          ? '<button type="button" class="secondary" data-bao-guide="provider-openrouter"><b>OpenRouter</b><span>一把 Key 可切多種模型</span></button>' : "",
        '<button type="button" class="ghost" data-bao-guide="provider-other">其他服務／中轉</button>'
      ]);
      return;
    }

    if (guideSession.connectionChoice === "byok" && guideSession.providerChoice === "manual") {
      copy.textContent = "請從下方「模型服務」選擇這把 API Key 的來源。只有自訂中轉才需要打開進階連線設定；官方服務先不用碰 Model ID 或網址。";
      actions.innerHTML = guideActions([
        '<button type="button" class="primary" data-bao-guide="manual-provider-ready">我選好了，貼 Key</button>',
        '<button type="button" class="secondary" data-bao-guide="change-provider">返回推薦選項</button>'
      ]);
      return;
    }

    if (guideSession.connectionChoice === "byok" && !hasKey) {
      copy.textContent = "我已經切到「" + currentProviderLabel + "」。現在只要把這家服務給你的 API Key 貼進金鑰欄；Model ID 和網址先不用碰。";
      actions.innerHTML = guideActions([
        '<button type="button" class="primary" data-bao-guide="focus-key">貼上 API Key</button>',
        '<button type="button" class="secondary" data-bao-guide="change-provider">我選錯服務了</button>'
      ]);
      return;
    }

    if (guideSession.connectionChoice === "byok" && hasKey) {
      copy.textContent = "金鑰已經貼好了。現在使用「" + currentProviderLabel + "」；模型先用目前選擇即可，之後隨時能換。";
      actions.innerHTML = guideActions([
        guideReady()
          ? '<button type="button" class="primary" data-bao-guide="start-story">設定好了，開始故事</button>'
          : '<button type="button" class="primary" data-bao-guide="check-ready">檢查還缺什麼</button>',
        '<button type="button" class="secondary" data-bao-guide="focus-model">我想換模型</button>'
      ]);
      return;
    }

    copy.textContent = currentProvider === "custom"
      ? "你現在使用自訂連線。這裡會保留完整 Provider、Protocol、Base URL 與 Model ID；包包不會替你改進階值。"
      : "目前設定可以直接沿用。需要時我可以再幫你找到金鑰或模型欄位。";
    actions.innerHTML = '<button type="button" class="secondary" data-bao-guide="dismiss">收起包包帶路</button>';
  };

  const ensureGuide = () => {
    if ($("bao-guided-setup")) return;
    const panel = view.querySelector(".builder-panel");
    if (!panel) return;
    const root = document.createElement("section");
    root.id = "bao-guided-setup";
    root.className = "bao-guided-setup";
    root.setAttribute("aria-label", "包包新手引導");
    root.innerHTML = [
      '<div class="bao-guided-setup-avatar">', guideAvatar(), '</div>',
      '<div class="bao-guided-setup-main">',
        '<div class="bao-guided-setup-head"><div><span data-bao-guide-eyebrow>包包帶路</span><strong>第一次來也沒關係，我陪你設定。</strong></div>',
        '<button type="button" class="bao-guide-close" data-bao-guide="dismiss" aria-label="收起包包帶路">×</button></div>',
        '<p data-bao-guide-copy></p>',
        '<div class="bao-guided-setup-actions" data-bao-guide-actions></div>',
      '</div>'
    ].join("");
    const reopen = document.createElement("button");
    reopen.type = "button";
    reopen.id = "bao-guide-reopen";
    reopen.className = "bao-guide-reopen";
    reopen.hidden = true;
    reopen.textContent = "🏮 讓包包帶我設定";
    panel.prepend(reopen);
    panel.insertBefore(root, reopen.nextSibling);

    root.addEventListener("click", event => {
      const action = event.target.closest("[data-bao-guide]")?.dataset.baoGuide;
      if (!action) return;
      if (action === "dismiss") {
        setGuideDismissed(true);
        renderGuide();
      } else if (action === "route-hosted") {
        guideSession.connectionChoice = "hosted";
        guideSession.providerChoice = "";
        selectRoute("hosted");
        renderGuide();
      } else if (action === "route-byok") {
        guideSession.connectionChoice = "byok";
        guideSession.providerChoice = "";
        selectRoute("byok");
        renderGuide();
      } else if (action === "provider-gemini") {
        chooseFriendlyProvider("gemini");
        renderGuide();
      } else if (action === "provider-openrouter") {
        chooseFriendlyProvider("openrouter");
        renderGuide();
      } else if (action === "provider-other") {
        guideSession.connectionChoice = "byok";
        guideSession.providerChoice = "manual";
        selectRoute("byok");
        provider()?.focus();
        provider()?.scrollIntoView({ block: "center", behavior: "smooth" });
        renderGuide();
      } else if (action === "manual-provider-ready") {
        guideSession.providerChoice = provider()?.value || "manual";
        if (provider()?.value === "custom") {
          const details = $("api-advanced-settings");
          if (details) details.open = true;
        }
        setTimeout(() => $("api-key")?.focus(), 0);
        renderGuide();
      } else if (action === "change-provider") {
        guideSession.providerChoice = "";
        renderGuide();
      } else if (action === "focus-key") {
        $("api-key")?.focus();
        $("api-key")?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (action === "focus-model") {
        model()?.focus();
        model()?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (action === "check-ready") {
        window.BAOStoryStartReadiness?.sync?.();
        $("bao-start-readiness")?.scrollIntoView({ block: "center", behavior: "smooth" });
        renderGuide();
      } else if (action === "start-story") {
        $("start-story")?.click();
      } else if (action === "focus-name") {
        $("persona-name")?.focus();
        $("persona-name")?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (action === "next-step") {
        App.nextStep?.();
        renderGuide();
      } else if (action === "recommend-step") {
        const current = activeBuilderStep();
        if (current === 1) { chooseRadio("narrative-mode", "immersive"); App.nextStep?.(); }
        else if (current === 2) { chooseRadio("display-mode", "text"); App.nextStep?.(); }
        else if (current === 5) {
          chooseRadio("memory-strength", "balanced");
          $("start-story")?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        renderGuide();
      }
    });
    reopen.addEventListener("click", () => {
      setGuideDismissed(false);
      guideSession.connectionChoice = "";
      guideSession.providerChoice = "";
      renderGuide();
    });
    ["input", "change"].forEach(type => {
      $("api-key")?.addEventListener(type, renderGuide);
      provider()?.addEventListener(type, renderGuide);
      model()?.addEventListener(type, renderGuide);
    });
    document.querySelectorAll(".builder-step").forEach(node =>
      new MutationObserver(renderGuide).observe(node, { attributes: true, attributeFilter: ["class"] })
    );
    if (provider()) new MutationObserver(renderGuide).observe(provider(), { childList: true });
    new MutationObserver(renderGuide).observe(view, {
      attributes: true,
      attributeFilter: ["data-bao-setup", "data-bao-connection", "data-bao-provider"]
    });
    renderGuide();
  };

  const ensure = () => {
    if (!$("bao-connection-mode")) {
      const box = document.createElement("section");
      box.id = "bao-connection-mode";
      box.className = "bao-connection-mode";
      box.setAttribute("aria-label", "選擇模型連線方式");
      box.innerHTML = `
        <div class="bao-connection-mode-head">
          <div><span>STEP 2 · CONNECT</span><h4>選一種模型連線方式</h4></div>
          <small>第一次玩只需要完成這裡；進階故事設定可以之後再調整。</small>
        </div>
        <div class="bao-connection-mode-grid">
          <button type="button" data-bao-connection="hosted" aria-pressed="false">
            <b>使用夜灣燈火</b>
            <span>不需要自己的連線金鑰；生成時會依使用量消耗燈火。</span>
          </button>
          <button type="button" data-bao-connection="byok" aria-pressed="false">
            <b>使用自己的模型連線</b>
            <span>自己的服務、自己的費用，不消耗夜灣燈火。</span>
          </button>
        </div>
        <div class="bao-connection-mode-foot">
          <p id="bao-connection-note" role="status"></p>
          <div class="bao-connection-help-links">
            <a id="bao-connection-account" href="account.html" hidden>登入／查看我的燈火 →</a>
            <a id="bao-connection-help" href="api-guide.html">完整連線說明 →</a>
          </div>
        </div>`;
      const intro = $("bao-quick-intro");
      (intro || step.querySelector("h3"))?.insertAdjacentElement("afterend", box);
      box.querySelectorAll("[data-bao-connection]").forEach(button =>
        button.addEventListener("click", () => selectRoute(button.dataset.baoConnection)));
    }

    step.classList.add("bao-builder-ai-v2");
    const heading = step.querySelector("h3");
    if (heading) heading.textContent = "模型連線";
    markFields();
    sync();
  };

  const init = () => {
    ensure();
    ensureGuide();
    provider()?.addEventListener("change", sync);
    model()?.addEventListener("change", sync);
    if (provider()) new MutationObserver(sync).observe(provider(), { childList: true });
    new MutationObserver(markConditionalSurfaces).observe(step, { childList: true, subtree: true });
    setTimeout(() => { markFields(); sync(); }, 250);
    window.addEventListener("storage", event => { if (event.key === "yorubay:session") sync(); });
  };

  window.BAOGuidedOnboarding = Object.freeze({ render: renderGuide, reopen: () => { setGuideDismissed(false); renderGuide(); } });
  window.BAOPlayerBuilderV2 = Object.freeze({ sync, selectRoute, renderGuide });
  init();
})();
