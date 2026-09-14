(() => {
  if (typeof CharacterEngine === "undefined") return;

  const asText = value => String(value || "").trim();
  const asArray = value => Array.isArray(value) ? value : [];
  const unique = list => [...new Set(list.map(x => String(x || "").trim()).filter(Boolean))];
  const pct = (value, total) => total > 0 ? Math.max(0, Math.min(1, value / total)) : 1;

  function audit(raw = {}) {
    const c = CharacterEngine.normalize(raw || {});
    const validation = CharacterEngine.validate(raw || {});
    const errors = [...validation.errors];
    const warnings = [];
    const recommendations = [];
    const sections = [];

    const addSection = (key, label, weight, earned, notes = []) => {
      const score = Math.round(weight * Math.max(0, Math.min(1, earned)));
      sections.push({ key, label, weight, score, notes: notes.filter(Boolean) });
    };

    const meta = raw.meta || {};
    const content = raw.content || {};
    const gameplay = raw.gameplay || {};
    const presentation = raw.presentation || {};
    const explicitCategory = asText(raw.category || meta.category).toLowerCase();

    if (explicitCategory && !["male", "female", "r18"].includes(explicitCategory)) {
      warnings.push("category 建議明確使用 male、female 或 r18，避免依舊格式推斷。");
    }
    if (!asText(c.description)) warnings.push("缺少角色列表簡介 description；不影響執行，但玩家難以理解作品定位。");
    if (!asText(c.avatar)) warnings.push("缺少 avatar；會使用預設圖片。");
    if (!asArray(c.tags).length) recommendations.push("補 2～6 個 tags，方便作品辨識與未來篩選。");

    const identityParts = [
      Boolean(asText(c.id)), Boolean(asText(c.name)),
      ["male", "female", "r18"].includes(c.category),
      Boolean(asText(c.description)), Boolean(asText(c.avatar))
    ];
    addSection("identity", "角色識別", 15, identityParts.filter(Boolean).length / identityParts.length,
      [!asText(c.description) && "缺少 description"]);

    const promptLength = asText(c.system_prompt).length;
    const greetingLength = asText(c.greeting).length;
    if (promptLength > 0 && promptLength < 80) warnings.push("system_prompt 很短；長篇角色通常需要更明確的人格、行為邏輯、語氣與底線。");
    if (greetingLength > 0 && greetingLength < 30) recommendations.push("開場 greeting 可以再補場景、時間、人物位置或初始張力，會比較容易直接進戲。");
    if (!asText(c.lore)) recommendations.push("若角色有過去事件、秘密或固定人物關係，可補 lore；純輕量角色可略過。");
    if (!asText(c.quote)) recommendations.push("可補一條代表性 quote，主要用於角色展示，不會影響核心運作。");

    const profile = c.profile && typeof c.profile === "object" && !Array.isArray(c.profile) ? c.profile : {};
    const profileKeys = Object.keys(profile);
    if (c.profile && (typeof c.profile !== "object" || Array.isArray(c.profile))) {
      warnings.push("content.profile 應為物件，方便維護完整角色設定。");
    } else if (profileKeys.length > 0 && profileKeys.length < 4) {
      recommendations.push("角色已使用 content.profile，但欄位偏少；可補外貌、行為邏輯、價值觀或關係進程。");
    }

    let characterCore = 0;
    characterCore += asText(c.system_prompt) ? 0.58 : 0;
    characterCore += asText(c.greeting) ? 0.20 : 0;
    characterCore += asText(c.lore) ? 0.12 : 0;
    characterCore += asText(c.quote) ? 0.10 : 0;
    addSection("core", "角色核心與開場", 25, characterCore,
      [!asText(c.system_prompt) && "缺少 system_prompt", !asText(c.greeting) && "缺少 greeting"]);

    const worldMode = c.supported_modes?.world === true;
    if (worldMode) {
      if (!asText(c.world)) warnings.push("已啟用世界模擬，但 world 為空；世界規則容易只靠模型臨場猜測。");
      if (!asArray(c.world_focus).length) recommendations.push("世界模擬建議填 world_focus，明確指出必須被模型持續注意的世界元素。");
      if (!asText(c.npc_rules)) recommendations.push("世界模擬建議補 npc_rules，定義 NPC 自主性、資訊隔離、離場與事件推進規則。");
      const worldScore = (asText(c.world) ? 0.52 : 0) + (asArray(c.world_focus).length ? 0.28 : 0) + (asText(c.npc_rules) ? 0.20 : 0);
      addSection("world", "世界模擬準備度", 15, worldScore,
        [!asText(c.world) && "world 為空", !asArray(c.world_focus).length && "world_focus 為空"]);
    } else {
      const noContradiction = !(asText(c.npc_rules) && !asText(c.world) && !asArray(c.initial_state?.npcs).length);
      if (!noContradiction) warnings.push("角色不是世界模擬模式，但設定了 NPC 規則且沒有世界/NPC 初始資料；請確認是否應開啟 world mode。");
      addSection("world", "模式一致性", 15, noContradiction ? 1 : 0.7,
        [!noContradiction && "NPC 規則與模式可能不一致"]);
    }

    const status = c.character_status || {};
    const statusFields = asArray(status.fields);
    const statusKeys = statusFields.map(field => asText(field?.key)).filter(Boolean);
    if (status.enabled && !statusFields.length) warnings.push("character_status 已啟用，但沒有任何 fields。");
    if (statusKeys.length !== unique(statusKeys).length) errors.push("character_status.fields 的 key 不可重複。");
    statusFields.forEach((field, index) => {
      if (!asText(field?.key)) errors.push(`character_status.fields[${index}] 缺少 key。`);
      if (!asText(field?.label)) warnings.push(`character_status.fields[${index}] 缺少 label。`);
      if (field?.type && !["text", "number", "boolean", "enum", "collection"].includes(field.type)) {
        warnings.push(`character_status 欄位「${field.key || index + 1}」使用未識別 type：${field.type}。`);
      }
    });

    const dynamicPrompts = asArray(c.dynamic_prompts);
    const dynamicIds = dynamicPrompts.map(block => asText(block?.id)).filter(Boolean);
    if (dynamicIds.length !== unique(dynamicIds).length) errors.push("dynamic_prompts 的 id 不可重複。");
    dynamicPrompts.forEach((block, index) => {
      if (!asText(block?.id)) errors.push(`dynamic_prompts[${index}] 缺少 id。`);
      if (!asText(block?.label)) warnings.push(`dynamic_prompts[${index}] 缺少 label。`);
      if (!asText(block?.text)) errors.push(`dynamic_prompts[${index}] 缺少 text。`);
      if (block?.always !== true && !asArray(block?.triggers).length) {
        warnings.push(`dynamic prompt「${block.id || index + 1}」沒有 triggers，也不是 always，不會被載入。`);
      }
    });

    const modules = asArray(c.world_modules);
    const moduleIds = modules.map(module => asText(module?.id)).filter(Boolean);
    if (moduleIds.length !== unique(moduleIds).length) errors.push("world_modules 的 id 不可重複。");
    modules.forEach((module, index) => {
      if (!asText(module?.id)) errors.push(`world_modules[${index}] 缺少 id。`);
      if (!asText(module?.label)) warnings.push(`world_modules[${index}] 缺少 label。`);
      const fields = asArray(module?.fields);
      const keys = fields.map(field => asText(field?.key)).filter(Boolean);
      if (keys.length !== unique(keys).length) errors.push(`world module「${module.id || index + 1}」的 fields.key 不可重複。`);
    });

    const initialModules = c.initial_state?.modules && typeof c.initial_state.modules === "object" ? c.initial_state.modules : {};
    Object.keys(initialModules).forEach(key => {
      if (!moduleIds.includes(key)) warnings.push(`initial_state.modules.${key} 沒有對應的 world_modules 定義。`);
    });

    const npcs = asArray(c.initial_state?.npcs);
    const npcNames = npcs.map(npc => asText(npc?.name)).filter(Boolean);
    if (npcNames.length !== unique(npcNames).length) warnings.push("initial_state.npcs 出現重複名稱；長篇追蹤時可能混淆同名 NPC。");
    npcs.forEach((npc, index) => {
      if (!asText(npc?.name)) errors.push(`initial_state.npcs[${index}] 缺少 name。`);
    });

    const gameplayNeeded = worldMode || c.supported_display?.ui === true;
    let gameplayScore = 1;
    if (gameplayNeeded) {
      const factors = [
        !status.enabled || statusFields.length > 0,
        modules.every(module => asText(module?.id) && asText(module?.label)),
        npcs.every(npc => asText(npc?.name)),
        Boolean(asText(c.initial_state?.time)) && Boolean(asText(c.initial_state?.location))
      ];
      gameplayScore = factors.filter(Boolean).length / factors.length;
      if (!modules.length && c.supported_display?.ui) recommendations.push("互動 UI 已啟用，但沒有 world_modules；如果 UI 只顯示基本人物/事件可忽略。");
    }
    addSection("gameplay", "長篇狀態與模組", 20, gameplayScore,
      [status.enabled && !statusFields.length && "狀態欄已啟用但沒有欄位"]);

    const narrative = c.narrative_profile || {};
    const recommendedStyles = asArray(narrative.recommended_styles);
    if (narrative.recommended_styles !== undefined && !Array.isArray(narrative.recommended_styles)) {
      warnings.push("presentation.narrative.recommended_styles 應為陣列，因為文風包允許複選。");
    }
    if (!asText(c.author_instructions)) recommendations.push("建議補 author_instructions：敘事鏡頭、節奏、對話格式與描寫原則最好和角色人格分開管理。");
    if (!recommendedStyles.length) recommendations.push("可以設定 recommended_styles，作為玩家可選文風建議；預設仍不強制開啟。");
    const narrativeScore = (asText(c.author_instructions) ? 0.55 : 0.25) + (narrative && typeof narrative === "object" ? 0.25 : 0) + (recommendedStyles.length ? 0.20 : 0.10);
    addSection("narrative", "敘事與作者控制", 15, Math.min(1, narrativeScore));

    const supportedDisplay = c.supported_display || {};
    const uiEnabled = supportedDisplay.ui === true;
    const panels = asArray(c.ui?.panels);
    if (uiEnabled && !panels.length) warnings.push("supported_display.ui=true，但 ui.panels 為空。");
    if (supportedDisplay.text !== true && supportedDisplay.ui !== true) errors.push("supported_display 至少需要啟用 text 或 ui 其中一種。");
    const presentationScore = (supportedDisplay.text === true || supportedDisplay.ui === true ? 0.55 : 0) + (!uiEnabled || panels.length ? 0.30 : 0) + (c.prompt_options ? 0.15 : 0);
    addSection("presentation", "顯示與 Prompt 配置", 10, presentationScore,
      [uiEnabled && !panels.length && "UI 已啟用但沒有 panels"]);

    const score = sections.reduce((sum, item) => sum + item.score, 0);
    const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "E";
    const ready = errors.length === 0 && score >= 75;
    const longFormReady = errors.length === 0 && score >= 85 && (!worldMode || Boolean(asText(c.world)));

    if (ready && !longFormReady) recommendations.unshift("這張卡已可開始測玩；建議先跑 10～20 輪，再依實際跑偏點補設定，不必為了滿分硬塞文字。");
    if (longFormReady) recommendations.unshift("已達長篇測試門檻；下一步應以實際對話驗收，而不是繼續增加設定量。");

    return {
      ok: errors.length === 0,
      ready,
      longFormReady,
      score,
      grade,
      errors: unique(errors),
      warnings: unique(warnings),
      recommendations: unique(recommendations),
      sections,
      character: c
    };
  }

  CharacterEngine.audit = audit;

  const escape = value => window.App?.escapeHTML ? App.escapeHTML(String(value ?? "")) : String(value ?? "").replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[x]));

  function reportHTML(report, fileName = "角色卡") {
    const status = report.longFormReady ? "可進長篇測試" : report.ready ? "可開始測玩" : "需要補強";
    const group = (title, list, empty) => `<section style="margin-top:16px"><h3 style="margin-bottom:8px">${title}</h3>${list.length ? `<ul>${list.map(item => `<li>${escape(item)}</li>`).join("")}</ul>` : `<p class="note">${empty}</p>`}</section>`;
    return `<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start"><div><div class="eyebrow">CHARACTER READINESS</div><h2 style="margin:4px 0">${escape(fileName)}</h2><p class="note">${escape(report.character.name)} · ${status}</p></div><div style="text-align:right"><b style="font-size:32px">${report.score}</b><span>/100 · ${report.grade}</span></div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:16px">${report.sections.map(section => `<div class="note"><b>${escape(section.label)}</b><br>${section.score}/${section.weight}</div>`).join("")}</div>
      ${group("必須修正", report.errors, "沒有阻擋匯入的結構錯誤。")}
      ${group("注意事項", report.warnings, "沒有明顯結構衝突。")}
      ${group("建議", report.recommendations, "目前沒有額外建議。")}`;
  }

  function showReport(report, fileName) {
    document.getElementById("bao-character-audit-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "bao-character-audit-modal";
    wrap.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px";
    wrap.innerHTML = `<section style="width:min(760px,100%);max-height:88vh;overflow:auto;background:var(--panel,#151515);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:24px"><button type="button" class="text-button" data-close style="float:right">關閉</button>${reportHTML(report, fileName)}</section>`;
    wrap.querySelector("[data-close]").onclick = () => wrap.remove();
    wrap.addEventListener("click", event => { if (event.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
  }

  function injectAuditTool() {
    const tools = document.querySelector(".character-tools");
    if (!tools || tools.querySelector("[data-character-audit]")) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.dataset.characterAudit = "true";
    button.textContent = "檢查角色完整度";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.hidden = true;
    button.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = JSON.parse(await file.text());
        showReport(audit(raw), file.name);
      } catch (error) {
        alert(error.message || "無法檢查這份角色檔案。");
      } finally {
        input.value = "";
      }
    };
    tools.insertBefore(button, tools.firstChild);
    tools.appendChild(input);
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (injectAuditTool() || attempts > 30) clearInterval(timer);
  }, 120);

  window.BAOCharacterReadiness = { audit, showReport, reportHTML };
})();