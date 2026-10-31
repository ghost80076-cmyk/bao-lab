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
    packageAssets: [],
    coverDataUrl: "",
    sourceFormat: "",
    audit: null
  };

  const errorLabels = {
    rights_confirmation_required: "請先確認作者擁有作品與圖片的公開權利。",
    invalid_character_card: "角色卡資料無效。",
    invalid_character_id: "角色 ID 只能使用英數、底線與連字號，最多 64 字元。",
    character_required_fields_missing: "角色卡缺少名稱、核心設定或開場白。",
    invalid_character_category: "作品取向必須是一般向、女性向或男性向。",
    invalid_character_rating: "內容分級必須是一般內容或成人內容。",
    character_card_too_large: "角色資料過大，請先精簡。",
    character_text_too_large: "核心設定或開場文字超出安全上限。",
    invalid_cover_image: "封面資料無效，請重新選擇圖片。",
    cover_image_too_large: "封面壓縮後仍超過 1.2 MB。",
    character_already_published: "這個角色 ID 已存在正式作品庫；若要發布新版，請切換成「更新既有作品」。",
    character_not_published: "找不到這個角色 ID 的正式作品；若是第一次發布，請切換成「發布新作品」。",
    published_character_file_missing: "正式作品資料存在，但角色檔案遺失；請先修復作品庫再更新。",
    published_character_metadata_invalid: "正式作品的版本資料不完整，無法安全建立更新 PR。",
    invalid_publication_mode: "發布方式無效，請重新選擇。",
    invalid_author_id: "作者 ID 只能使用小寫英數、底線與連字號，長度 2–64 字元。",
    author_name_required: "作者公開頁需要作者顯示名稱。",
    author_id_required_for_support: "要提供「支持作者」連結，請先填寫穩定的作者 ID。",
    invalid_author_support_url: "支持作者連結必須是有效的 HTTPS 網址，且不能包含帳號密碼。",
    invalid_author_profile: "作者公開資料無效。",
    invalid_license_policy: "授權條件無效，請確認各欄位。",
    invalid_license_mode: "作品授權模式無效。",
    author_id_required_for_license: "使用單張獨立授權，必須先填寫作者 ID。",
    author_identity_mismatch: "這個已發布作品已綁定其他作者 ID，不能在一般更新流程直接改綁。",
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

  function authorPayload() {
    return {
      author_id: String($("publish-author-id")?.value || "").trim().toLowerCase(),
      author_name: String($("publish-author")?.value || "").trim(),
      author_bio: String($("publish-author-bio")?.value || "").trim(),
      author_support_label: String($("publish-author-support-label")?.value || "支持作者").trim(),
      author_support_url: String($("publish-author-support-url")?.value || "").trim()
    };
  }


  const BASE_LICENSE = {
    redistribution: "permission_required",
    adaptations: "permission_required",
    commercial_use: "prohibited",
    attribution_required: true
  };

  function licensePolicy(prefix) {
    return {
      redistribution: $(prefix + "-redistribution").value,
      adaptations: $(prefix + "-adaptations").value,
      commercial_use: $(prefix + "-commercial").value,
      attribution_required: $(prefix + "-attribution").value === "true"
    };
  }

  function setLicensePolicy(prefix, policy) {
    const p = { ...BASE_LICENSE, ...(policy || {}) };
    $(prefix + "-redistribution").value = p.redistribution;
    $(prefix + "-adaptations").value = p.adaptations;
    $(prefix + "-commercial").value = p.commercial_use;
    $(prefix + "-attribution").value = String(p.attribution_required);
  }

  function setLicenseMessage(message, success = false) {
    const el = $("publish-license-message");
    if (!el) return;
    el.textContent = message;
    el.className = success ? "success" : "note";
  }

  function toggleLicenseOverride() {
    const custom = $("publish-license-mode")?.value === "custom";
    const panel = $("publish-license-custom-fields");
    if (panel) panel.hidden = !custom;
  }

  async function loadLicenseDefault() {
    if (!window.YoruBayAdmin?.isAuthenticated?.()) throw new Error("請先登入管理員。");
    const authorId = authorPayload().author_id;
    if (!authorId) throw new Error("請先填寫作者 ID。");
    const button = $("publish-license-load");
    button.disabled = true;
    setLicenseMessage("正在讀取作者預設授權…");
    try {
      const result = await window.YoruBayAdmin.api(
        "/admin/authors/license-default?author_id=" + encodeURIComponent(authorId)
      );
      if (authorPayload().author_id !== authorId) {
        setLicenseMessage("作者 ID 已變更，請重新讀取新作者的預設。");
        return;
      }
      setLicensePolicy("publish-license-default", result.policy);
      setLicensePolicy("publish-license-custom", result.policy);
      $("publish-license-default-note").textContent = result.saved
        ? "已儲存至 D1｜版本 " + result.revision
        : "此作者尚無 D1 預設紀錄，畫面使用保守預設；可在下方儲存。";
      setLicenseMessage("✓ 作者授權條件已載入。", true);
    } catch (error) {
      setLicenseMessage("讀取作者預設失敗：" + friendly(error));
      throw error;
    } finally {
      button.disabled = false;
    }
  }

  async function saveLicenseDefault() {
    if (!window.YoruBayAdmin?.isAuthenticated?.()) throw new Error("請先登入管理員。");
    const authorId = authorPayload().author_id;
    if (!authorId) throw new Error("請先填寫作者 ID。");
    const button = $("publish-license-save-default");
    button.disabled = true;
    setLicenseMessage("正在儲存作者預設至 D1…");
    try {
      const data = await window.YoruBayAdmin.api("/admin/authors/license-default", {
        method: "POST",
        body: JSON.stringify({
          author_id: authorId,
          policy: licensePolicy("publish-license-default")
        })
      });
      $("publish-license-default-note").textContent =
        "✓ D1 已儲存作者 " + authorId + " 的預設授權｜版本 " + data.revision;
      setLicenseMessage("✓ 作者預設已儲存；選擇「套用作者預設」的作品將在提交 PR 時取用最新版本。", true);
    } catch (error) {
      setLicenseMessage("儲存作者預設失敗：" + friendly(error));
      throw error;
    } finally {
      button.disabled = false;
    }
  }

  function setAuthorMessage(text, ok = false) {
    const el = $("publish-author-message");
    if (!el) return;
    el.textContent = text || "";
    el.className = ok ? "success" : "note";
  }

  function updateAuthorProfileButton() {
    const button = $("publish-author-profile-pr");
    if (!button) return;
    const payload = authorPayload();
    button.disabled = !(payload.author_id && payload.author_name);
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
    for (const key of ["work_package_regex", "source_format", "source_origin", "redacted_fields", "unmapped_fields", "unavailable_features"]) {
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
    const rating = $("publish-rating")?.value === "adult" ? "adult" : "general";
    const description = String($("publish-description").value || "").trim();
    const author = String($("publish-author").value || "").trim();
    const authorId = String($("publish-author-id")?.value || "").trim().toLowerCase();
    // A reviewed admin entry overrides imported credit; otherwise retain source
    // attribution even for flat cards, where source.meta no longer exists.
    const creditedAuthor = author || c.creator || c.author || c.import_metadata?.creator || sourceMeta.creator || sourceMeta.author || "";
    const creditedAuthorId = authorId || c.creator_id || c.author_id || sourceMeta.creator_id || sourceMeta.author_id || "";

    const card = {
      schema_version: String(source.schema_version || "1.5"),
      meta: {
        ...sourceMeta,
        id,
        name,
        title,
        avatar: c.avatar,
        category,
        rating,
        gender: c.gender || "",
        tags: tagsFromInput(),
        description,
        audience: c.audience || [],
        categories: c.categories || [],
        creator: creditedAuthor,
        creator_id: creditedAuthorId,
        author: creditedAuthor,
        author_id: creditedAuthorId
      },
      content: {
        ...sourceContent,
        quote: c.quote || "",
        greeting: c.greeting || "",
        greeting_context: c.greeting_context || "",
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
        ...(c.gameplay_ui ? { ui_schema: c.gameplay_ui } : {}),
        ...(c.story_startup ? { story_startup: c.story_startup } : {}),
        ...(c.timeline_policy ? { timeline_policy: c.timeline_policy } : {}),
        ...(c.actor_mode ? { actor_mode: c.actor_mode } : {}),
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
        ...(c.phone_ui ? { phone_ui: c.phone_ui } : {}),
        ...(c.dialogue ? { dialogue: c.dialogue } : {}),
        ...(c.reading_background ? { reading_background: c.reading_background } : {}),
        play_info_surface: c.play_info_surface,
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

    if (c.discovery) card.meta.discovery = c.discovery;
    if (c.asset_manifest) card.asset_manifest = c.asset_manifest;
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
    $("publish-category").value = ["general", "male", "female"].includes(c.category) ? c.category : "general";
    if ($("publish-rating")) $("publish-rating").value = c.rating === "adult" ? "adult" : "general";
    $("publish-description").value = c.description || "";
    $("publish-tags").value = (c.tags || []).join(", ");
    // Display exactly the attribution that buildCard() will preserve, for
    // both native and flat cards. A reviewer can still edit the form.
    $("publish-author-id").value = String(c.creator_id || c.author_id || state.sourceCard?.meta?.creator_id ||
      state.sourceCard?.meta?.author_id || "").trim().toLowerCase();
    $("publish-author").value = String(c.creator || c.author || c.import_metadata?.creator ||
      state.sourceCard?.meta?.creator || state.sourceCard?.meta?.author || "").trim();
    $("publish-author-bio").value = "";
    $("publish-author-support-label").value = "支持作者";
    $("publish-author-support-url").value = "";
    $("publish-source-summary").textContent = "來源：" + state.sourceFormat + "｜開場 " + (c.greeting || "").length + " 字｜核心設定 " + (c.system_prompt || "").length + " 字";
    const sourcePreview = $("publish-card-preview");
    sourcePreview.textContent = (c.greeting || "").slice(0, 1200) || "沒有開場內容。";
  }

  async function parseSelectedFile() {
    const file = $("publish-character-file").files?.[0];
    if (!file) throw new Error("請先選擇 ZIP、PNG 或 JSON 作品。");
    setMessage("解析中…");
    state.audit = null;
    state.character = null;state.sourceCard = null;updateButton();
    state.coverDataUrl = "";
    $("publish-cover-preview").hidden = true;
    state.packageAssets=[];
    let prepared;
    if(/\.zip$/i.test(file.name)){
      const core=window.BAOWorkPackageCore;if(file.size>core.LIMITS.archive)throw new Error('作品包超過 32 MB。');
      const files=await core.unzip(new Uint8Array(await file.arrayBuffer()));
      const result=core.assemble(core.jsonFile(files,'manifest.json'),files);
      const library=result.character.gameplay?.initial_state?.worldbookLibrary||result.character.initial_state?.worldbookLibrary;
      if(library&&!engine.normalizeWorldbookLibrary(library))throw new Error('作品世界書超過目前容量或格式不正確；沒有省略任何條目。');
      if(result.assets.length>32)throw new Error('公開上架目前最多 32 張圖片，請分批整理；沒有移除任何圖片。');
      let total=0;
      state.packageAssets=result.assets.map(asset=>{total+=asset.bytes.length;let binary='';for(const byte of asset.bytes)binary+=String.fromCharCode(byte);return {id:asset.id,mime:asset.mime,base64:btoa(binary)};});
      if(total>12*1024*1024) {state.packageAssets=[];throw new Error('公開上架圖片合計超過 12 MB，請先整理圖片。');}
      const used=new Set(['manifest.json',result.manifest.character,result.manifest.regex,...result.manifest.worldbooks.map(x=>typeof x==='string'?x:x.path),...result.assets.map(x=>x.path)]);
      prepared={character:result.character,format:'夜灣作品包 ZIP',manual:result.manifest.adaptation?.manual||[],extraFiles:Object.keys(files).filter(x=>!used.has(x)).length};
      const cover=state.packageAssets.find(image=>result.assets.find(x=>x.id===image.id)?.role==='cover');
      if(cover){$('publish-cover-preview').src='data:'+cover.mime+';base64,'+cover.base64;$('publish-cover-preview').hidden=false;$('publish-cover-note').textContent='作品包封面與其他圖片會保留原始檔案，隨 PR 發布。';}
    }else prepared = await importer.prepareFile(file);
    fillForm(prepared.character, prepared.format || prepared.origin);
    if (prepared.cover instanceof Blob) await encodeCover(prepared.cover);
    validateCard();
    if(prepared.extraFiles)$('publish-source-summary').textContent+='｜'+prepared.extraFiles+' 個來源／其他附件保留在原 ZIP，不會隨 PR 公開';
    if(prepared.manual?.length)$('publish-source-summary').textContent+='｜待適配：'+prepared.manual.join('；');
    if(state.packageAssets.length) $("publish-source-summary").textContent += "｜隨包圖片 "+state.packageAssets.length+" 張；世界書與正則隨角色發布";
    setMessage(prepared.converted ? "✓ 酒館 V2 已轉成夜灣格式，請確認欄位後建立 PR。" : "✓ 夜灣角色卡已載入，請確認欄位後建立 PR。", true);
  }

  async function loadSeparateCover() {
    const file = $("publish-cover-file").files?.[0];
    if (!file) return;
    if (!/^image\//i.test(file.type || "")) throw new Error("請選擇圖片檔案。");
    await encodeCover(file);
    setMessage("✓ 已更新發布封面。", true);
  }

  async function publishAuthorProfile() {
    if (!window.YoruBayAdmin?.isAuthenticated?.()) throw new Error("請先在上方完成管理員登入。");

    const payload = authorPayload();
    if (!payload.author_id) throw new Error("invalid_author_id");
    if (!payload.author_name) throw new Error("author_name_required");

    const button = $("publish-author-profile-pr");
    if (button) button.disabled = true;
    setAuthorMessage("正在建立作者資料 PR…");

    try {
      const data = await window.YoruBayAdmin.api("/admin/authors/profile-pr", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setAuthorMessage(
        "✓ 作者資料 PR #" + (data.pr_number || "—") +
        " 已建立；作品內容與 published_version 不會變動。",
        true
      );

      if (data.pr_url) {
        const result = $("publish-result");
        if (result) {
          const line = document.createElement("div");
          line.className = "note";
          const link = document.createElement("a");
          link.href = data.pr_url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "開啟作者資料 PR #" + (data.pr_number || "—");
          line.appendChild(link);
          result.prepend(line);
        }
      }
    } catch (error) {
      setAuthorMessage("建立作者資料 PR 失敗：" + friendly(error));
      throw error;
    } finally {
      updateAuthorProfileButton();
    }
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
          license_mode: $("publish-license-mode").value,
          ...($("publish-license-mode").value === "custom"
            ? { license_policy: licensePolicy("publish-license-custom") }
            : {}),
          publication_mode: $("publish-mode")?.value === "update" ? "update" : "create",
          author_id: String($("publish-author-id")?.value || "").trim().toLowerCase(),
          author_name: String($("publish-author").value || "").trim(),
          author_bio: String($("publish-author-bio")?.value || "").trim(),
          author_support_label: String($("publish-author-support-label")?.value || "支持作者").trim(),
          author_support_url: String($("publish-author-support-url")?.value || "").trim(),
          source_format: state.sourceFormat,
          card,
          package_assets: state.packageAssets,
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
        (data.author_id ? "｜作者 ID：" + data.author_id : "") +
        (data.author_directory_path ? "｜作者資料：" + data.author_directory_path : "") +
        (data.asset_path ? "｜封面：" + data.asset_path : "");
      result.append(detail);
      if (data.warning === "license_audit_write_failed") {
        setLicenseMessage("注意：PR 已建立，但 D1 授權提交紀錄未寫入成功；請先修復，再合併。");
      }
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

  $("publish-author-profile-pr")?.addEventListener("click", async () => {
    try { await publishAuthorProfile(); }
    catch {}
  });

  ["publish-id", "publish-name", "publish-title", "publish-category", "publish-rating", "publish-description", "publish-tags", "publish-author-id", "publish-author", "publish-author-bio", "publish-author-support-label", "publish-author-support-url"].forEach(id => {
    $(id)?.addEventListener("input", () => {
      state.audit = null;
      renderAudit(null);
      updateButton();
      updateAuthorProfileButton();
    });
    $(id)?.addEventListener("change", () => {
      state.audit = null;
      renderAudit(null);
      updateButton();
      updateAuthorProfileButton();
    });
  });


  $("publish-license-load")?.addEventListener("click", async () => {
    try { await loadLicenseDefault(); } catch {}
  });
  $("publish-license-save-default")?.addEventListener("click", async () => {
    try { await saveLicenseDefault(); } catch {}
  });
  $("publish-license-mode")?.addEventListener("change", toggleLicenseOverride);
  $("publish-author-id")?.addEventListener("input", () => {
    $("publish-license-default-note").textContent = "作者 ID 已編輯，請重新讀取授權預設。";
  });
  setLicensePolicy("publish-license-default", BASE_LICENSE);
  setLicensePolicy("publish-license-custom", BASE_LICENSE);
  toggleLicenseOverride();

  $("publish-rights")?.addEventListener("change", updateButton);
  $("publish-mode")?.addEventListener("change", updateButton);
  updateButton();
  updateAuthorProfileButton();
})();
