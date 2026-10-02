/* BAO/LAB admin character publication console. GitHub credentials never reach the browser. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const engine = window.CharacterEngine || (typeof CharacterEngine !== "undefined" ? CharacterEngine : null);
  const importer = window.BAOCharacterImport;
  if (!engine || !importer) return;

  const state = {
    character: null,
    sourceCard: null,
    coverDataUrl: "",
    sourceFormat: "",
    audit: null
  };

  const errorLabels = {
    rights_confirmation_required: "請先確認作者擁有作品與圖片的公開權利。",
    invalid_character_card: "角色卡資料無效。",
    invalid_character_id: "角色 ID 只能使用英數、底線與連字號，最多 64 字元。",
    character_required_fields_missing: "角色卡缺少名稱、核心設定或開場白。",
    invalid_character_category: "作品分區必須是男性向、女性向或 R18。",
    character_card_too_large: "角色資料過大，請先精簡。",
    character_text_too_large: "核心設定或開場文字超出安全上限。",
    invalid_cover_image: "封面資料無效，請重新選擇圖片。",
    cover_image_too_large: "封面壓縮後仍超過 1.2 MB。",
    character_already_published: "這個角色 ID 已存在正式作品庫；若要發布新版，請切換成「更新既有作品」。",
    character_not_published: "找不到這個角色 ID 的正式作品；若是第一次發布，請切換成「發布新作品」。",
    published_character_file_missing: "正式作品資料存在，但角色檔案遺失；請先修復作品庫再更新。",
    published_character_metadata_invalid: "正式作品的版本資料不完整，無法安全建立更新 PR。",
    invalid_publication_mode: "發布方式無效，請重新選擇。",
    github_publish_not_configured: "Worker 尚未設定 GitHub 發布金鑰。",
    github_publish_failed: "GitHub 建立 PR 失敗，請檢查 Worker 的 GitHub 權限與設定。",
    not_found: "目前線上 Worker 尚未部署作品發布端點。"
  };

  function setMessage(text, ok = false) {
    const el = $("publish-message");
    if (!el) return;
    el.textContent = text || "";
    el.className = ok ? "success" : "error";
  }

  function friendly(error) {
    const raw = String(error?.message || error || "操作失敗");
    const key = raw.replace(/^HTTP \d+\s*/, "").trim();
    return errorLabels[key] || errorLabels[error?.code] || raw;
  }

  function tagsFromInput() {
    return String($("publish-tags").value || "")
      .split(/[,，\n]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 24);
  }

  function safeImportMetadata(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const out = {};
    for (const key of ["source_format", "source_origin", "redacted_fields", "unmapped_fields", "unavailable_features"]) {
      if (value[key] !== undefined) out[key] = value[key];
    }
    return Object.keys(out).length ? out : undefined;
  }

  function publicSafeSection(value) {
    if (Array.isArray(value)) return value.map(publicSafeSection);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "preserved_source") continue;
      out[key] = publicSafeSection(item);
    }
    return out;
  }

  function buildCard() {
    if (!state.character) throw new Error("請先解析角色卡。");
    const c = engine.normalize(state.character);
    const source = state.sourceCard && typeof state.sourceCard === "object" && !Array.isArray(state.sourceCard)
      ? publicSafeSection(state.sourceCard)
      : {};
    const sourceMeta = source.meta && typeof source.meta === "object" && !Array.isArray(source.meta) ? source.meta : {};
    const sourceContent = source.content && typeof source.content === "object" && !Array.isArray(source.content) ? source.content : {};
    const sourceGameplay = source.gameplay && typeof source.gameplay === "object" && !Array.isArray(source.gameplay) ? source.gameplay : {};
    const sourcePresentation = source.presentation && typeof source.presentation === "object" && !Array.isArray(source.presentation) ? source.presentation : {};

    const id = String($("publish-id").value || "").trim();
    const name = String($("publish-name").value || "").trim();
    const title = String($("publish-title").value || name).trim();
    const category = $("publish-category").value;
    const description = String($("publish-description").value || "").trim();
    const author = String($("publish-author").value || "").trim();

    const card = {
      schema_version: String(source.schema_version || "1.5"),
      meta: {
        ...sourceMeta,
        id,
        name,
        title,
        avatar: c.avatar,
        category,
        rating: category === "r18" ? "adult" : "general",
        gender: c.gender || "",
        tags: tagsFromInput(),
        description,
        audience: c.audience || [],
        categories: c.categories || [],
        creator: author || c.import_metadata?.creator || sourceMeta.creator || ""
      },
      content: {
        ...sourceContent,
        quote: c.quote || "",
        greeting: c.greeting || "",
        system_prompt: c.system_prompt || "",
        profile: c.profile || {},
        world: c.world || "",
        world_focus: c.world_focus || [],
        lore: c.lore || "",
        npc_rules: c.npc_rules || "",
        author_instructions: c.author_instructions || "",
        creator_notes: c.creator_notes || "",
        dynamic_prompts: c.dynamic_prompts || []
      },
      gameplay: {
        ...sourceGameplay,
        supported_modes: c.supported_modes || sourceGameplay.supported_modes || { immersive: true, world: false },
        prompt: {
          ...(sourceGameplay.prompt && typeof sourceGameplay.prompt === "object" && !Array.isArray(sourceGameplay.prompt) ? sourceGameplay.prompt : {}),
          ...(c.prompt_options || {})
        },
        character_status: c.character_status || sourceGameplay.character_status || {},
        world_modules: c.world_modules || sourceGameplay.world_modules || [],
        initial_state: {
          ...(sourceGameplay.initial_state && typeof sourceGameplay.initial_state === "object" && !Array.isArray(sourceGameplay.initial_state) ? sourceGameplay.initial_state : {}),
          ...(c.initial_state || {})
        }
      },
      presentation: {
        ...sourcePresentation,
        supported_display: c.supported_display || sourcePresentation.supported_display || { text: true, ui: false },
        ui: {
          ...(sourcePresentation.ui && typeof sourcePresentation.ui === "object" && !Array.isArray(sourcePresentation.ui) ? sourcePresentation.ui : {}),
          ...(c.ui || { type: "basic", panels: ["npc", "status", "events", "memory"] })
        },
        narrative: {
          ...(sourcePresentation.narrative && typeof sourcePresentation.narrative === "object" && !Array.isArray(sourcePresentation.narrative) ? sourcePresentation.narrative : {}),
          ...(c.narrative_profile || {})
        }
      }
    };

    if (c.opening) card.presentation.opening = c.opening;
    const importMetadata = safeImportMetadata(c.import_metadata);
    if (importMetadata) card.import_metadata = importMetadata;
    return card;
  }

  function renderAudit(report) {
    const box = $("publish-audit");
    if (!box) return;
    box.replaceChildren();
    if (!report) {
      box.textContent = "尚未驗證。";
      return;
    }
    const headline = document.createElement("b");
    headline.textContent = "BAO Doctor：" + report.score + "/100 · " + report.grade +
      (report.ready ? " · 可測玩" : " · 建議補強");
    box.append(headline);

    const lines = [];
    if (report.errors?.length) lines.push("阻擋：" + report.errors.join("；"));
    if (report.warnings?.length) lines.push("注意：" + report.warnings.slice(0, 4).join("；"));
    if (!lines.length) lines.push("結構檢查通過；仍請在 PR 內人工確認內容。");
    const p = document.createElement("p");
    p.textContent = lines.join("\n");
    p.style.whiteSpace = "pre-wrap";
    box.append(p);
  }

  function updateButton() {
    const button = $("publish-create-pr");
    if (!button) return;
    const mode = $("publish-mode")?.value === "update" ? "update" : "create";
    button.textContent = mode === "update" ? "建立作品更新 PR" : "建立上架 PR";
    button.disabled = !(state.character && state.audit?.ok && $("publish-rights").checked);

    const note = $("publish-mode-note");
    if (note) {
      note.textContent = mode === "update"
        ? "更新模式只接受已存在的角色 ID。最初 published_at 會保留，公開版本自動 +1；更新仍先進 GitHub PR，不會直接部署。"
        : "新作品模式只接受尚未發布的角色 ID，會建立公開版本 v1。若 ID 已存在，請改用更新模式。";
    }
  }

  function validateCard() {
    const card = buildCard();
    importer.inspect(card);
    state.audit = typeof engine.audit === "function" ? engine.audit(card) : { ok: true, ready: true, score: 100, grade: "A", errors: [], warnings: [] };
    renderAudit(state.audit);
    updateButton();
    return card;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("無法讀取封面。"));
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("無法解析封面圖片。"));
      };
      img.src = url;
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  async function encodeCover(blob) {
    if (!(blob instanceof Blob) || !blob.size) {
      state.coverDataUrl = "";
      return;
    }
    const img = await loadImage(blob);
    let scale = Math.min(1, 1600 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    let quality = 0.86;
    let encoded = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) throw new Error("瀏覽器無法處理封面。");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      encoded = await canvasBlob(canvas, "image/webp", quality);
      if (!encoded) encoded = await canvasBlob(canvas, "image/png");
      if (encoded && encoded.size <= 1100000) break;
      scale *= 0.78;
      quality = Math.max(0.58, quality - 0.08);
    }

    if (!encoded || encoded.size > 1200000) throw new Error("封面壓縮後仍超過 1.2 MB，請使用較小圖片。");
    state.coverDataUrl = await blobToDataUrl(encoded);
    $("publish-cover-preview").src = state.coverDataUrl;
    $("publish-cover-preview").hidden = false;
    $("publish-cover-note").textContent = "發布封面：" + Math.round(encoded.size / 1024) + " KB；已重新編碼並移除原 PNG metadata。";
  }

  function fillForm(character, format) {
    state.sourceCard = character && typeof character === "object"
      ? JSON.parse(JSON.stringify(character))
      : null;
    const c = engine.normalize(character);
    state.character = c;
    state.sourceFormat = format || c.import_metadata?.source_format || "BAO/LAB";
    $("publish-id").value = c.id || "";
    $("publish-name").value = c.name || "";
    $("publish-title").value = c.title || c.name || "";
    $("publish-category").value = ["male", "female", "r18"].includes(c.category) ? c.category : "male";
    $("publish-description").value = c.description || "";
    $("publish-tags").value = (c.tags || []).join(", ");
    $("publish-author").value = c.import_metadata?.creator || "";
    $("publish-source-summary").textContent = "來源：" + state.sourceFormat + "｜開場 " + (c.greeting || "").length + " 字｜核心設定 " + (c.system_prompt || "").length + " 字";
    const sourcePreview = $("publish-card-preview");
    sourcePreview.textContent = (c.greeting || "").slice(0, 1200) || "沒有開場內容。";
  }

  async function parseSelectedFile() {
    const file = $("publish-character-file").files?.[0];
    if (!file) throw new Error("請先選擇 PNG 或 JSON 角色卡。");
    setMessage("解析中…");
    state.audit = null;
    state.coverDataUrl = "";
    $("publish-cover-preview").hidden = true;
    const prepared = await importer.prepareFile(file);
    fillForm(prepared.character, prepared.format || prepared.origin);
    if (prepared.cover instanceof Blob) await encodeCover(prepared.cover);
    validateCard();
    setMessage(prepared.converted ? "✓ 酒館 V2 已轉成夜灣格式，請確認欄位後建立 PR。" : "✓ 夜灣角色卡已載入，請確認欄位後建立 PR。", true);
  }

  async function loadSeparateCover() {
    const file = $("publish-cover-file").files?.[0];
    if (!file) return;
    if (!/^image\//i.test(file.type || "")) throw new Error("請選擇圖片檔案。");
    await encodeCover(file);
    setMessage("✓ 已更新發布封面。", true);
  }

  async function publish() {
    if (!window.YoruBayAdmin?.isAuthenticated?.()) throw new Error("請先在上方完成管理員登入。");
    const card = validateCard();
    if (!$("publish-rights").checked) throw new Error("請先確認作者公開權利。");
    const button = $("publish-create-pr");
    button.disabled = true;
    setMessage("正在建立 GitHub PR…");
    $("publish-result").replaceChildren();
    try {
      const data = await window.YoruBayAdmin.api("/admin/characters/publish-pr", {
        method: "POST",
        body: JSON.stringify({
          rights_confirmed: true,
          publication_mode: $("publish-mode")?.value === "update" ? "update" : "create",
          author_name: String($("publish-author").value || "").trim(),
          source_format: state.sourceFormat,
          card,
          cover_data_url: state.coverDataUrl || null
        })
      });
      const result = $("publish-result");
      const strong = document.createElement("strong");
      strong.textContent = "✓ PR #" + (data.pr_number || "—") + " 已建立。";
      result.append(strong);
      if (data.pr_url) {
        const link = document.createElement("a");
        link.href = data.pr_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "開啟 GitHub PR";
        link.style.marginLeft = "10px";
        result.append(link);
      }
      const detail = document.createElement("div");
      detail.className = "note";
      detail.textContent = "方式：" + (data.publication_mode === "update" ? "更新既有作品" : "發布新作品") +
        "｜公開版本：v" + (data.published_version || 1) +
        "｜分支：" + (data.branch || "—") +
        "｜Bucket：" + (data.bucket || "—") +
        "｜Catalog：" + (data.catalog_page_path || "—") +
        "｜角色：" + (data.character_path || "—") +
        (data.asset_path ? "｜封面：" + data.asset_path : "");
      result.append(detail);
      setMessage(
        data.publication_mode === "update"
          ? "✓ 已建立作品更新 PR；尚未直接部署正式站。合併後玩家才會看到新版與 UPDATED。"
          : "✓ 已建立上架 PR；尚未直接部署正式站。請先看 Actions 與 PR 內容。",
        true
      );
    } catch (error) {
      setMessage("建立 PR 失敗：" + friendly(error));
      throw error;
    } finally {
      updateButton();
    }
  }

  $("publish-load")?.addEventListener("click", async () => {
    $("publish-load").disabled = true;
    try { await parseSelectedFile(); }
    catch (error) { setMessage("✕ " + friendly(error)); }
    finally { $("publish-load").disabled = false; }
  });

  $("publish-cover-file")?.addEventListener("change", async () => {
    try { await loadSeparateCover(); }
    catch (error) { setMessage("✕ " + friendly(error)); }
  });

  $("publish-validate")?.addEventListener("click", () => {
    try {
      validateCard();
      setMessage(state.audit?.ok ? "✓ 結構驗證通過。" : "✕ 結構仍有錯誤。", Boolean(state.audit?.ok));
    } catch (error) {
      state.audit = null;
      renderAudit(null);
      updateButton();
      setMessage("✕ " + friendly(error));
    }
  });

  $("publish-create-pr")?.addEventListener("click", async () => {
    try { await publish(); }
    catch {}
  });

  ["publish-id", "publish-name", "publish-title", "publish-category", "publish-description", "publish-tags", "publish-author"].forEach(id => {
    $(id)?.addEventListener("input", () => {
      state.audit = null;
      renderAudit(null);
      updateButton();
    });
    $(id)?.addEventListener("change", () => {
      state.audit = null;
      renderAudit(null);
      updateButton();
    });
  });

  $("publish-rights")?.addEventListener("change", updateButton);
  $("publish-mode")?.addEventListener("change", updateButton);
  updateButton();
})();
