/* BAO/LAB character JSON import hardening. Local-only; no network for imported cards. */
(() => {
  if (typeof CharacterEngine === "undefined") return;
  const engine = CharacterEngine;
  const validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
  const text = value => typeof value === "string" ? value.trim() : "";
  const object = value => value && typeof value === "object" && !Array.isArray(value);

  function inspect(raw) {
    if (!object(raw)) throw new Error("角色檔案必須是單一 JSON 物件，不是陣列或故事備份。");
    if (raw.spec === "chara_card_v2" || raw.spec === "chara_card_v3" || object(raw.data) && (raw.data.name || raw.data.description)) {
      throw new Error("這是酒館／SillyTavern 角色卡格式，目前尚未支援自動轉換；請使用 BAO/LAB 模板建立角色。");
    }
    if (raw.schema_version && !/^1(?:\.|$)/.test(String(raw.schema_version))) {
      throw new Error("不支援這份角色卡的 schema_version；請使用 BAO/LAB 1.x 模板。");
    }
    if (raw.meta !== undefined && !object(raw.meta)) throw new Error("meta 必須是 JSON 物件。");
    if (raw.content !== undefined && !object(raw.content)) throw new Error("content 必須是 JSON 物件。");
    const meta = raw.meta || {};
    const content = raw.content || {};
    const id = text(meta.id || raw.id);
    const name = text(meta.name || raw.name);
    const greeting = text(content.greeting || raw.greeting);
    const prompt = text(content.system_prompt || raw.system_prompt);
    const missing = [!id && "meta.id / id", !name && "meta.name / name", !greeting && "content.greeting / greeting", !prompt && "content.system_prompt / system_prompt"].filter(Boolean);
    if (missing.length) throw new Error("角色卡缺少必要欄位：" + missing.join("、") + "。請先補齊再匯入。");
    if (!validId.test(id)) throw new Error("角色 ID 只能使用 1～64 字元的英數、底線及連字號，且必須以英數開頭。");
    const category = text(meta.category || raw.category).toLowerCase();
    if (category && !["male", "female", "r18"].includes(category)) throw new Error("category 只能使用 male、female 或 r18。");
    const avatar = text(meta.avatar || raw.avatar);
    if (avatar && !/^(https:\/\/|assets\/)/i.test(avatar)) throw new Error("角色圖片請使用 HTTPS 網址或 assets/ 本站路徑。");
    if (raw.gameplay !== undefined && !object(raw.gameplay)) throw new Error("gameplay 必須是 JSON 物件。");
    if (raw.presentation !== undefined && !object(raw.presentation)) throw new Error("presentation 必須是 JSON 物件。");
    if (typeof engine.audit === "function") {
      const report = engine.audit(raw);
      if (!report.ok) throw new Error("角色卡結構錯誤：" + report.errors.join("；"));
    }
    return engine.normalize(raw);
  }

  async function importFile(file) {
    if (!file || typeof file.text !== "function") throw new Error("請先選擇 JSON 角色檔案。");
    if (typeof file.size === "number" && file.size > 1024 * 1024) throw new Error("角色 JSON 超過 1 MB，請先精簡或拆分內容。");
    let raw;
    try { raw = JSON.parse(await file.text()); }
    catch { throw new Error("JSON 語法錯誤，請確認括號、引號與逗號格式。"); }
    const character = inspect(raw);
    const builtin = (typeof App !== "undefined" && Array.isArray(App.characters) ? App.characters : [])
      .some(item => item.id === character.id && item.source === "built-in");
    if (builtin) throw new Error("這個角色 ID 與內建作品重複；請修改 JSON 中的 meta.id，避免遮蔽原作品。");

    // Do not silently overwrite a broken saved library or evict the 100th card.
    let existing;
    try {
      const saved = localStorage.getItem(engine.storageKey);
      existing = saved === null ? [] : JSON.parse(saved);
      if (!Array.isArray(existing)) throw new Error("本機角色庫格式異常");
    } catch { throw new Error("本機角色庫無法解析；為避免覆蓋資料，本次匯入已取消。"); }
    const duplicate = existing.some(item => item?.id === character.id);
    if (duplicate && !window.confirm(`本機已有 ID「${character.id}」的角色。確定要以新檔覆蓋角色設定嗎？現有故事存檔不會被修改。`)) {
      throw new Error("已取消同 ID 角色覆蓋，原有資料沒有變更。");
    }
    if (!duplicate && existing.length >= 100) throw new Error("本機角色庫已達 100 張上限；請先備份並移除不需要的角色。");
    character.source = "local-import";
    engine.saveCustom(character);
    const persisted = engine.loadCustom().find(item => item.id === character.id);
    if (!persisted || persisted.name !== character.name || persisted.system_prompt !== character.system_prompt || persisted.greeting !== character.greeting) {
      throw new Error("本機儲存驗證未通過；請檢查瀏覽器儲存空間與隱私模式。");
    }
    return character;
  }

  engine.importFile = importFile;
  function enhanceTools() {
    const tools = document.querySelector(".character-tools");
    if (!tools || tools.dataset.importUpgrade === "1") return false;
    const advanced = tools.querySelector('a[href="data/characters/character-template.json"]');
    if (!advanced) return false;
    advanced.textContent = "下載進階世界模板";
    const basic = document.createElement("a");
    basic.className = "secondary";
    basic.href = "data/characters/character-basic-template.json";
    basic.download = "bao-character-basic-template.json";
    basic.textContent = "下載基礎角色模板";
    advanced.before(basic);
    const notice = document.createElement("p");
    notice.className = "note";
    notice.style.width = "100%";
    notice.textContent = "目前可匯入 BAO/LAB 角色 JSON；其他平台角色卡需先轉換。角色與設定僅保存在這台瀏覽器。";
    tools.appendChild(notice);
    tools.dataset.importUpgrade = "1";
    return true;
  }
  if (typeof document !== "undefined") {
    let attempts = 0;
    const timer = setInterval(() => { if (enhanceTools() || ++attempts >= 60) clearInterval(timer); }, 100);
  }
  window.BAOCharacterImport = { inspect, importFile };
})();