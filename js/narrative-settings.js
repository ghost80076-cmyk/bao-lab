(() => {
  if (typeof App === "undefined") return;

  const KEY = "bao-lab:narrative-settings-v1";
  const defaults = {
    stylePacks: [],
    density: "card",
    paragraphs: "auto",
    innerThoughts: "card",
    physicalContinuity: false,
    intimacyDetailMod: false,
    intimacy: "card",
    matureDrama: "card",
    characterAgency: "card",
    responseLength: "card",
    pacing: "card",
    dialogueBalance: "card",
    customInstructions: []
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

  const CUSTOM_INSTRUCTION_LIMIT = 10;
  const CUSTOM_INSTRUCTION_CHARS = 200;
  const cleanInstructionText = value => String(value ?? "").trim().slice(0, CUSTOM_INSTRUCTION_CHARS);
  const instructionFingerprint = value => cleanInstructionText(value)
    .toLocaleLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'"「」『』（）()【】\[\]—–_-]+/g, "");

  const normalizeCustomInstructions = value => {
    const source = Array.isArray(value) ? value : [];
    return source.map(item => {
      const raw = typeof item === "string" ? { text: item, enabled: true } : (item && typeof item === "object" ? item : {});
      const text = cleanInstructionText(raw.text);
      return text ? { text, enabled: raw.enabled !== false } : null;
    }).filter(Boolean).slice(0, CUSTOM_INSTRUCTION_LIMIT);
  };

  const classifyInstruction = value => {
    const text = cleanInstructionText(value);
    if (!text) return { kind: "empty", message: "" };

    if (/(忽略|無視|覆蓋|跳過).{0,14}(平台|系統|硬規則|最高規則|安全規則|system)/i.test(text)) {
      return { kind: "conflict", message: "這條想覆蓋平台規則；夜灣不會把它送進故事 Prompt。" };
    }
    if (/(NPC|角色).{0,12}(可以|允許|應該|必須).{0,16}(上帝視角|全知|知道所有|未在場.{0,6}知道)/i.test(text)) {
      return { kind: "conflict", message: "這條會破壞角色資訊邊界；夜灣不會把它送進故事 Prompt。" };
    }
    if (/(可以|允許|請|應該|必須).{0,16}(AI|模型|系統)?.{0,10}(替|代替).{0,8}玩家.{0,16}(決定|描寫|描述|補寫).{0,8}(心理|想法|台詞|行動|選擇|同意)/i.test(text)) {
      return { kind: "conflict", message: "這條會讓 AI 取得玩家控制權；夜灣不會把它送進故事 Prompt。" };
    }

    if (/(禁止|不得|不要|嚴禁).{0,18}(AI|模型)?.{0,10}(替|代替|補寫)?.{0,8}玩家.{0,18}(心理|想法|心聲|台詞|行動|決定|選擇|同意)/i.test(text)
      || /玩家.{0,10}(心理|想法|心聲).{0,10}(留白|不描寫|不得描寫)/i.test(text)) {
      return { kind: "redundant", message: "夜灣已預設保護玩家控制權；這條會自動去重，不再重複送出。" };
    }
    if (/(NPC|角色).{0,14}(禁止|不得|不能|不要|嚴禁).{0,16}(上帝視角|全知|讀取未在場|未在場.{0,6}(資訊|事件|心聲))/i.test(text)
      || /(禁止|不得|不要|嚴禁).{0,12}(NPC|角色).{0,12}(上帝視角|全知)/i.test(text)) {
      return { kind: "redundant", message: "夜灣已有角色資訊隔離；這條會自動去重，不再重複送出。" };
    }
    if (/(每(?:則|輪)|回覆).{0,16}\d{2,4}.{0,10}\d{2,4}.{0,8}(字|文字)/i.test(text)) {
      return { kind: "native", message: "可改用上方「每輪篇幅」；保留這條時仍會照常送出。" };
    }
    return { kind: "custom", message: "會作為本故事的長期寫作偏好送給模型。" };
  };

  const effectiveCustomInstructions = value => {
    const seen = new Set();
    return normalizeCustomInstructions(value).filter(item => item.enabled).filter(item => {
      const classification = classifyInstruction(item.text);
      if (classification.kind === "conflict" || classification.kind === "redundant") return false;
      const fingerprint = instructionFingerprint(item.text);
      if (!fingerprint || seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    }).map(item => item.text);
  };

  const normalizePrefs = value => {
    const raw = value && typeof value === "object" ? value : {};
    let stylePacks = validStylePacks(raw.stylePacks);
    if (!stylePacks.length && raw.stylePack && raw.stylePack !== "off" && packs[raw.stylePack]) {
      stylePacks = [raw.stylePack];
    }
    const normalized = { ...defaults, ...raw, stylePacks };
    normalized.matureDrama = ["card", "mature"].includes(normalized.matureDrama) ? normalized.matureDrama : "card";
    normalized.characterAgency = ["card", "autonomous"].includes(normalized.characterAgency) ? normalized.characterAgency : "card";
    normalized.responseLength = ["card", "short", "medium", "long"].includes(normalized.responseLength) ? normalized.responseLength : "card";
    normalized.pacing = ["card", "slow", "balanced", "brisk"].includes(normalized.pacing) ? normalized.pacing : "card";
    normalized.dialogueBalance = ["card", "dialogue", "balanced", "description"].includes(normalized.dialogueBalance) ? normalized.dialogueBalance : "card";
    normalized.customInstructions = normalizeCustomInstructions(raw.customInstructions);
    normalized.intimacyDetailMod = normalized.intimacyDetailMod === true;
    return normalized;
  };

  const read = () => {
    try { return normalizePrefs(JSON.parse(localStorage.getItem(KEY) || "{}") || {}); }
    catch { return { ...defaults, stylePacks: [] }; }
  };
  let settings = read();
  const save = () => localStorage.setItem(KEY, JSON.stringify(settings));

  const ensureStyles = () => {
    if (!document.querySelector('link[href^="css/narrative-settings.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "css/narrative-settings.css?v=3";
      document.head.appendChild(link);
    }
  };

  const close = () => document.querySelector(".bao-modal-backdrop")?.remove();
  const isStoryLocal = () => Boolean(document.getElementById("chat-view")?.classList.contains("active") && App.config);
  const clonePrefs = prefs => ({ ...prefs, stylePacks: [...prefs.stylePacks], customInstructions: prefs.customInstructions.map(item => ({ ...item })) });
  const activePrefs = () => {
    if (isStoryLocal() && App.config?.narrative) return normalizePrefs(App.config.narrative);
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
    if (normalized.intimacyDetailMod) items.push("親密場景 MOD");
    else if (normalized.intimacy !== "card") items.push(normalized.intimacy === "fade" ? "親密淡化" : normalized.intimacy === "emotion" ? "親密重情感" : "親密連續描寫");
    if (normalized.matureDrama === "mature") items.push("成熟文學題材");
    if (normalized.characterAgency === "autonomous") items.push("高角色自主");
    if (normalized.responseLength !== "card") items.push(normalized.responseLength === "short" ? "短篇幅" : normalized.responseLength === "medium" ? "中篇幅" : "長篇幅");
    if (normalized.pacing !== "card") items.push(normalized.pacing === "slow" ? "慢節奏" : normalized.pacing === "balanced" ? "平衡節奏" : "較快推進");
    if (normalized.dialogueBalance !== "card") items.push(normalized.dialogueBalance === "dialogue" ? "對話較多" : normalized.dialogueBalance === "balanced" ? "對話描寫平衡" : "描寫較多");
    const customCount = effectiveCustomInstructions(normalized.customInstructions).length;
    if (customCount) items.push(`自訂指令 ${customCount}`);
    return items;
  };

  const statusLabel = prefs => {
    const items = summaryItems(prefs);
    return {
      items,
      text: items.length ? `✦ 敘事與描寫 · ${items.length} 項啟用` : "✦ 敘事與描寫",
      title: items.length ? `目前啟用：${items.join("、")}` : "目前完全依角色卡，未額外套用敘事偏好。"
    };
  };

  const updateChatButtonState = () => {
    const btn = document.querySelector("[data-bao-open='narrative']");
    if (!btn) return;
    const status = statusLabel(activePrefs());
    btn.textContent = status.text;
    btn.title = status.title;
    btn.dataset.activeCount = String(status.items.length);
    btn.setAttribute("aria-label", status.title);
    btn.classList.toggle("is-active", status.items.length > 0);
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

  const instructionCardHTML = (item = { text: "", enabled: true }) => {
    const text = String(item?.text ?? "").slice(0, CUSTOM_INSTRUCTION_CHARS);
    const enabled = item?.enabled !== false;
    return `<article class="narrative-instruction-card" data-instruction-item>
      <div class="narrative-instruction-top"><label><input type="checkbox" data-instruction-enabled ${enabled ? "checked" : ""}> 啟用</label><button type="button" class="text-button" data-instruction-delete>刪除</button></div>
      <textarea data-instruction-text maxlength="${CUSTOM_INSTRUCTION_CHARS}" rows="3" placeholder="例如：重要對話不要急著總結，留給角色自然沉默或停頓。">${App.escapeHTML(text)}</textarea>
      <div class="narrative-instruction-meta"><span data-instruction-hint></span><span data-instruction-count>${text.length} / ${CUSTOM_INSTRUCTION_CHARS}</span></div>
    </article>`;
  };

  const refreshInstructionCards = wrap => {
    const cards = [...wrap.querySelectorAll("[data-instruction-item]")];
    const seen = new Set();
    cards.forEach(card => {
      const area = card.querySelector("[data-instruction-text]");
      const hint = card.querySelector("[data-instruction-hint]");
      const count = card.querySelector("[data-instruction-count]");
      const text = cleanInstructionText(area?.value || "");
      if (count) count.textContent = `${String(area?.value || "").length} / ${CUSTOM_INSTRUCTION_CHARS}`;
      let classification = classifyInstruction(text);
      const fingerprint = instructionFingerprint(text);
      if (fingerprint && seen.has(fingerprint)) {
        classification = { kind: "duplicate", message: "與上方另一條相同；送出時只保留一份。" };
      } else if (fingerprint) {
        seen.add(fingerprint);
      }
      if (hint) {
        hint.textContent = classification.message;
        hint.dataset.kind = classification.kind;
      }
    });
    const add = wrap.querySelector("[data-add-instruction]");
    if (add) add.disabled = cards.length >= CUSTOM_INSTRUCTION_LIMIT;
    const total = wrap.querySelector("[data-instruction-total]");
    if (total) total.textContent = `${cards.length} / ${CUSTOM_INSTRUCTION_LIMIT}`;
  };

  const bindInstructionCard = (wrap, card) => {
    card.querySelector("[data-instruction-text]")?.addEventListener("input", () => refreshInstructionCards(wrap));
    card.querySelector("[data-instruction-enabled]")?.addEventListener("change", () => refreshInstructionCards(wrap));
    card.querySelector("[data-instruction-delete]")?.addEventListener("click", () => {
      card.remove();
      refreshInstructionCards(wrap);
    });
  };

  const openModal = () => {
    close();
    const prefs = activePrefs();
    const storyLocal = isStoryLocal();
    const selected = new Set(prefs.stylePacks);
    const focus = worldFocus();
    const wrap = document.createElement("div");
    wrap.className = "bao-modal-backdrop";
    wrap.innerHTML = `<section class="bao-modal narrative-settings-modal" role="dialog" aria-modal="true" aria-labelledby="narrative-settings-title">
      <div class="bao-modal-head"><div><div class="eyebrow">OPTIONAL NARRATIVE LAYER</div><h2 id="narrative-settings-title">敘事與描寫設定</h2></div><div class="narrative-head-actions"><button class="narrative-help" type="button" data-narrative-help aria-label="敘事設定說明" aria-expanded="false">?</button><button class="bao-modal-close" type="button">關閉</button></div></div>
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
          <h3>篇幅、節奏與對話比例</h3>
          <p>這些是故事級偏好，不會把每一輪硬塞成固定格式；遇到短回應、等待或必要留白時仍可自然縮短。</p>
          <div class="narrative-select-grid">
            <label>每輪篇幅
              <select data-pref="responseLength">
                <option value="card" ${prefs.responseLength === "card" ? "selected" : ""}>依角色卡／模型判斷</option>
                <option value="short" ${prefs.responseLength === "short" ? "selected" : ""}>精簡 · 約 300–600 字</option>
                <option value="medium" ${prefs.responseLength === "medium" ? "selected" : ""}>適中 · 約 600–1000 字</option>
                <option value="long" ${prefs.responseLength === "long" ? "selected" : ""}>詳細 · 約 900–1400 字</option>
              </select><small>以內容密度為優先，不為湊字數重複敘述。</small>
            </label>
            <label>敘事節奏
              <select data-pref="pacing">
                <option value="card" ${prefs.pacing === "card" ? "selected" : ""}>依角色卡</option>
                <option value="slow" ${prefs.pacing === "slow" ? "selected" : ""}>慢慢展開</option>
                <option value="balanced" ${prefs.pacing === "balanced" ? "selected" : ""}>平衡</option>
                <option value="brisk" ${prefs.pacing === "brisk" ? "selected" : ""}>推進較快</option>
              </select><small>不論快慢，重要選擇與轉折都要保留玩家回應空間。</small>
            </label>
            <label>對話與描寫
              <select data-pref="dialogueBalance">
                <option value="card" ${prefs.dialogueBalance === "card" ? "selected" : ""}>依角色卡</option>
                <option value="dialogue" ${prefs.dialogueBalance === "dialogue" ? "selected" : ""}>對話較多</option>
                <option value="balanced" ${prefs.dialogueBalance === "balanced" ? "selected" : ""}>平衡</option>
                <option value="description" ${prefs.dialogueBalance === "description" ? "selected" : ""}>描寫較多</option>
              </select><small>只調整比例，不改變角色原本的說話習慣。</small>
            </label>
          </div>
        </div>

        <div class="bao-setting-section">
          <div class="narrative-instruction-heading"><div><h3>自訂長期指令</h3><p>只放「AI 應該怎麼寫」；劇情事實、NPC 資料與關係請放記憶／Canon。每條最多 ${CUSTOM_INSTRUCTION_CHARS} 字，${storyLocal ? "只修改目前故事" : "會成為新故事的起始偏好"}。</p></div><span class="chip" data-instruction-total>0 / ${CUSTOM_INSTRUCTION_LIMIT}</span></div>
          <div class="narrative-instruction-list" data-instruction-list>${prefs.customInstructions.map(instructionCardHTML).join("")}</div>
          <button type="button" class="secondary narrative-instruction-add" data-add-instruction>＋ 新增長期指令</button>
          <div class="narrative-token-note"><strong>自動去重：</strong>夜灣原生已有「不代寫玩家」與角色資訊隔離。重複規則會提示並省略；想覆蓋平台硬規則或破壞資訊邊界的指令不會送出。其餘自訂內容會留在穩定的故事偏好層，只有修改偏好時才改變。</div>
        </div>

        <div class="bao-setting-section">
          <h3>成熟題材與角色自主</h3>
          <p>這一層只控制故事取向，不取代角色卡，也不會用提示詞去要求模型忽略上游服務規則。</p>
          <div class="narrative-select-grid">
            <label>成熟文學題材
              <select data-pref="matureDrama">
                <option value="card" ${prefs.matureDrama === "card" ? "selected" : ""}>依角色卡</option>
                <option value="mature" ${prefs.matureDrama === "mature" ? "selected" : ""}>成年成熟敘事</option>
              </select><small>允許複雜情感、慾望、道德困境、浪漫與親密關係，不自動說教或急著把衝突化解。</small>
            </label>
            <label>角色自主程度
              <select data-pref="characterAgency">
                <option value="card" ${prefs.characterAgency === "card" ? "selected" : ""}>依角色卡</option>
                <option value="autonomous" ${prefs.characterAgency === "autonomous" ? "selected" : ""}>高自主性</option>
              </select><small>NPC 可依人格與利益拒絕、誤解、爭執、欺瞞、主動行動或犯錯，不以討好玩家為最高原則。</small>
            </label>
          </div>
          <div class="narrative-token-note"><strong>設計原則：</strong>保留成熟題材與人物自主的敘事價值；不加入「忽略拒絕、繞過審查、把抗拒視為同意」之類的破限指令。</div>
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
          <label class="narrative-switch" style="margin-top:12px"><span><b>親密場景加強 MOD</b><br><small class="note">完全由玩家手動開啟；夜灣不自動判斷或切換。開啟後只在成年、合意的親密情境中加強表情、聲音、姿態、動作、身體反應與空間連續性，避免無故跳時或草率帶過。實際可生成內容仍依所選模型與服務商規則。</small></span><input type="checkbox" data-pref-check="intimacyDetailMod" ${prefs.intimacyDetailMod ? "checked" : ""}></label>
          <label class="narrative-switch" style="margin-top:12px"><span><b>身體與空間連續性</b><br><small class="note">追蹤位置、姿態、接觸、施力／受力、衣物與環境的前後變化。打鬥與親密互動都適用。</small></span><input type="checkbox" data-pref-check="physicalContinuity" ${prefs.physicalContinuity ? "checked" : ""}></label>
          <div class="narrative-token-note"><strong>玩家控制：</strong>親密場景 MOD 預設關閉，只在玩家主動開啟後加入敘事偏好；不會自行偵測場景或嘗試繞過上游模型規則。<br><strong>Token 原則：</strong>全部維持預設時，不會新增文風 Prompt。即使複選多個文風包，也會先合併與去重，不會直接把多套完整 Prompt 疊上去。</div>
        </div>
      </div>
      <div class="bao-modal-footer"><button class="secondary" type="button" data-narrative-reset>全部恢復預設</button><button class="primary" type="button" data-narrative-save>套用設定</button></div>
    </section>`;
    document.body.appendChild(wrap);

    wrap.querySelector(".bao-modal-close").onclick = close;
    wrap.querySelector("[data-narrative-help]")?.addEventListener("click", event => {
      const modal = event.currentTarget.closest(".narrative-settings-modal");
      const open = !modal?.classList.contains("narrative-help-open");
      modal?.classList.toggle("narrative-help-open", open);
      event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
    });
    wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
    wrap.querySelectorAll("[data-style-pack]").forEach(btn => btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      updatePackStatus(wrap);
    }));
    updatePackStatus(wrap);
    wrap.querySelectorAll("[data-instruction-item]").forEach(card => bindInstructionCard(wrap, card));
    wrap.querySelector("[data-add-instruction]").onclick = () => {
      const list = wrap.querySelector("[data-instruction-list]");
      if (!list || list.querySelectorAll("[data-instruction-item]").length >= CUSTOM_INSTRUCTION_LIMIT) return;
      list.insertAdjacentHTML("beforeend", instructionCardHTML({ text: "", enabled: true }));
      const card = list.lastElementChild;
      bindInstructionCard(wrap, card);
      card.querySelector("[data-instruction-text]")?.focus();
      refreshInstructionCards(wrap);
    };
    refreshInstructionCards(wrap);

    wrap.querySelector("[data-narrative-reset]").onclick = () => {
      const next = normalizePrefs(defaults);
      if (storyLocal) {
        App.config.narrative = clonePrefs(next);
        App.saveStory?.(false);
      } else {
        settings = next;
        save();
      }
      close();
      updateBuilderSummary();
      updateChatButtonState();
    };
    wrap.querySelector("[data-narrative-save]").onclick = () => {
      const stylePacks = [...wrap.querySelectorAll("[data-style-pack].active")].map(btn => btn.dataset.stylePack);
      const customInstructions = [...wrap.querySelectorAll("[data-instruction-item]")].map(card => ({
        text: card.querySelector("[data-instruction-text]")?.value || "",
        enabled: Boolean(card.querySelector("[data-instruction-enabled]")?.checked)
      }));
      const next = normalizePrefs({ ...defaults, stylePacks, customInstructions });
      wrap.querySelectorAll("[data-pref]").forEach(el => { next[el.dataset.pref] = el.value; });
      wrap.querySelectorAll("[data-pref-check]").forEach(el => { next[el.dataset.prefCheck] = Boolean(el.checked); });
      const normalized = normalizePrefs(next);
      if (storyLocal) {
        App.config.narrative = clonePrefs(normalized);
        App.saveStory?.(false);
      } else {
        settings = normalized;
        save();
      }
      close();
      updateBuilderSummary();
      updateChatButtonState();
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

    if (prefs.matureDrama === "mature") {
      lines.push("以面向成年讀者的成熟文學取向處理複雜情感、慾望、道德困境、浪漫與親密關係。角色可以有矛盾、衝動與錯誤判斷，並承擔其後果；避免自動說教，也不要為了快速恢復和諧而把有價值的衝突過早化解。");
    }
    if (prefs.characterAgency === "autonomous") {
      lines.push("NPC／角色維持自身人格、利益、情緒、關係與資訊邊界，可拒絕、誤解、欺瞞、爭執、逃避、主動接近、強硬表態或犯錯；不要只為迎合玩家就自動改變立場。拒絕與衝突可以成為劇情推進的一部分，但不得把明確拒絕擅自改寫成同意。");
    }

    if (prefs.density === "concise") lines.push("描寫精簡，保留推進劇情所需的關鍵動作、對話與反應。");
    if (prefs.density === "standard") lines.push("描寫保持中等密度，兼顧動作、感官、環境與對話，不重複解釋同一資訊。");
    if (prefs.density === "rich") lines.push("描寫密度高；每段承擔不同資訊，補足動作、感官、環境、因果與場景後果，不靠同義詞堆砌篇幅。");

    if (prefs.responseLength === "short") lines.push("每輪通常以約 300–600 個中文字為目標；若當下只需要一句回應、停頓或短動作，可自然更短，不為湊字數重複。");
    if (prefs.responseLength === "medium") lines.push("每輪通常以約 600–1000 個中文字為目標；依場景需要調整，不為湊字數重複或提前推進未發生內容。");
    if (prefs.responseLength === "long") lines.push("每輪通常以約 900–1400 個中文字為目標；以有效內容密度為優先，不為湊字數重複描寫或替玩家補行動。");

    if (prefs.pacing === "slow") lines.push("敘事慢慢展開：重要互動拆成可回應的小步驟，多保留停頓、觀察與未說完的空間，不主動跳過關鍵過程。");
    if (prefs.pacing === "balanced") lines.push("敘事節奏保持平衡：完整處理本輪行動，再自然推進一個有因果的新節點；重要轉折仍等待玩家回應。");
    if (prefs.pacing === "brisk") lines.push("敘事可較快推進明確且低風險的過程，但遇到重要選擇、關係轉折或不可逆行動時停下，保留玩家決定空間。");

    if (prefs.dialogueBalance === "dialogue") lines.push("提高對話比例，以角色說話、停頓與可觀察反應承載資訊；旁白聚焦必要的動作、環境和節奏，不用長段總結取代對話。");
    if (prefs.dialogueBalance === "balanced") lines.push("對話與描寫保持平衡：讓角色語言、動作、表情與場景資訊互相支撐，不讓任何一邊長時間壓過另一邊。");
    if (prefs.dialogueBalance === "description") lines.push("提高動作、環境、感官與空間描寫比例，但保留角色自然需要說出的對話，不用旁白代替角色立場。");

    if (prefs.paragraphs !== "auto") lines.push(`每輪通常以 ${prefs.paragraphs.replace("-", "–")} 段完成；依場景節奏調整，不為湊段數重複內容。`);

    if (prefs.innerThoughts === "none") lines.push("不直接揭露 NPC／角色內心，只從行為、表情、語氣與可觀察反應呈現；不得替玩家描述心理。");
    if (prefs.innerThoughts === "restrained") lines.push("NPC／角色內心只偶爾以短句克制揭露，保留留白；不得替玩家描述心理。");
    if (prefs.innerThoughts === "clear") lines.push("可明確描寫 NPC／角色的內在想法與矛盾，但不得替玩家描述心理、意圖或未說出口的決定。");

    if (prefs.physicalContinuity) lines.push("保持身體與空間連續性：位置、姿態、接觸、施力／受力、衣物與環境變化必須前後有因果，不可無故跳位或重置。");

    if (prefs.intimacyDetailMod) {
      lines.push("玩家已手動開啟親密場景加強 MOD。僅在故事明確涉及已成年角色且為合意的親密互動時生效：保持情緒、表情、呼吸與聲音、姿態、動作、接觸、身體反應、衣物與空間變化的連續性；不要用一句話草率跳過已建立的場景，也不要為了堆細節而重複。角色界線與同意仍依劇情和人物設定處理；實際可生成內容依所選模型與服務商規則。");
    } else {
      if (prefs.intimacy === "fade") lines.push("親密互動可淡化或快速帶過，不要求逐步描寫。");
      if (prefs.intimacy === "emotion") lines.push("親密互動以情緒、信任、距離與關係變化為主，保持必要的動作連續性，不以細節堆疊取代人物關係。");
      if (prefs.intimacy === "continuous") lines.push("親密互動不要無故跳時或省略關鍵轉折；保持距離、姿態、接觸、反應、衣物與場景變化的連續性，並讓角色卡既有的世界觀特徵在相關時自然參與。");
    }

    const customInstructions = effectiveCustomInstructions(prefs.customInstructions);
    if (customInstructions.length) {
      lines.push(`玩家另加的故事級寫作指令：\n${customInstructions.map(text => `- ${text}`).join("\n")}`);
    }

    if (!lines.length) return "";
    lines.push("以上偏好不得破壞角色卡人格、世界規則、既有事實、玩家控制權或角色資訊邊界。");
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
    if (!row) return;
    const existing = row.querySelector("[data-bao-open='narrative']");
    if (existing) {
      updateChatButtonState();
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary";
    btn.dataset.baoOpen = "narrative";
    btn.onclick = openModal;
    row.insertBefore(btn, row.firstChild);
    updateChatButtonState();
  };

  const originalCollect = App.collectConfig.bind(App);
  App.collectConfig = function() {
    const cfg = originalCollect();
    cfg.narrative = clonePrefs(settings);
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
    get: () => clonePrefs(settings),
    set: value => { settings = normalizePrefs(value); save(); updateBuilderSummary(); updateChatButtonState(); },
    open: openModal,
    buildPrompt: buildPreferencePrompt,
    classifyInstruction,
    effectiveCustomInstructions: prefs => [...effectiveCustomInstructions(normalizePrefs(prefs).customInstructions)],
    summaryItems: prefs => [...summaryItems(prefs)],
    statusLabel: prefs => ({ ...statusLabel(prefs), items: [...statusLabel(prefs).items] })
  };

  ensureStyles();
  const init = () => { injectBuilder(); bindChatButton(); updateBuilderSummary(); updateChatButtonState(); };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 150));
  else setTimeout(init, 150);
})();