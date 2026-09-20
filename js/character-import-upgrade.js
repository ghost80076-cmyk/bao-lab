/* Local-only import. Character-card text is never executed or sent to a model. */
(() => {
  if (typeof CharacterEngine === "undefined") return;
  const engine = CharacterEngine,
    MAX_JSON_BYTES = 1024 * 1024,
    MAX_PNG_BYTES = 10 * 1024 * 1024,
    MAX_METADATA_BYTES = 1024 * 1024,
    validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
  const text = v => typeof v === "string" ? v.trim() : "";
  const object = v => v && typeof v === "object" && !Array.isArray(v);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const clone = v => JSON.parse(JSON.stringify(v));

  function scrubSecrets(v, hits = []) {
    if (Array.isArray(v)) return v.map(x => scrubSecrets(x, hits));
    if (!object(v)) return v;
    return Object.fromEntries(Object.entries(v).map(([key, value]) => {
      if (/(api[_-]?key|authorization|password|secret|access[_-]?token|refresh[_-]?token)/i.test(key)) {
        hits.push(key); return [key, "[REDACTED]"];
      }
      return [key, scrubSecrets(value, hits)];
    }));
  }
  function makeId(name) {
    const slug = String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
    let hash = 0; for (const char of String(name || "character")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return `st-${slug || "character"}-${(hash >>> 0).toString(36)}`.slice(0, 64);
  }
  function worldBook(book) {
    const entries = Array.isArray(book?.entries) ? book.entries : [];
    const active = entries.filter(x => x && x.enabled !== false && text(x.content)).sort((a,b) => Number(a.insertion_order || 0) - Number(b.insertion_order || 0));
    return { count: active.length, text: active.map((x, i) => {
      const keys = Array.isArray(x.keys) ? x.keys.filter(Boolean).join("、") : text(x.key);
      return `【世界書 ${i + 1}${keys ? `｜觸發：${keys}` : ""}】\n${text(x.content)}`;
    }).join("\n\n").slice(0, 60000) };
  }
  function convertSillyTavern(raw, origin = "JSON") {
    if (raw.spec !== "chara_card_v2" || !object(raw.data)) {
      if (raw.spec === "chara_card_v3") throw new Error("這是 SillyTavern V3 角色卡；目前先支援 V2 JSON／PNG，請從酒館匯出 V2。");
      throw new Error("不是可辨識的 SillyTavern V2 角色卡。");
    }
    const d = raw.data, name = text(d.name), description = text(d.description), personality = text(d.personality), scenario = text(d.scenario);
    const greeting = text(d.first_mes) || text(d.alternate_greetings?.[0]);
    if (!name) throw new Error("SillyTavern V2 角色卡缺少 data.name。");
    if (!greeting) throw new Error("SillyTavern V2 角色卡缺少 first_mes／alternate_greetings，無法建立 BAO/LAB 開場。");
    const core = [description && `【角色描述】\n${description}`, personality && `【性格】\n${personality}`, scenario && `【情境／世界前提】\n${scenario}`, text(d.post_history_instructions) && `【後續回覆指示】\n${text(d.post_history_instructions)}`].filter(Boolean).join("\n\n");
    if (!core) throw new Error("SillyTavern V2 角色卡缺少 description、personality、scenario 等可轉換設定。");
    const book = worldBook(d.character_book), tags = Array.isArray(d.tags) ? d.tags.map(text).filter(Boolean).slice(0,24) : [], lowerTags = tags.map(x => x.toLowerCase());
    const category = lowerTags.some(x => /(r18|adult|nsfw|18\+)/.test(x)) ? "r18" : lowerTags.some(x => /(female|女性向|女向)/.test(x)) ? "female" : "male";
    const redacted = [], known = new Set(["name","description","personality","scenario","first_mes","alternate_greetings","mes_example","creator_notes","system_prompt","post_history_instructions","character_book","tags","extensions","creator","character_version","talkativeness","fav","avatar"]);
    const unknown = Object.keys(d).filter(key => !known.has(key));
    const unavailable = [];
    if (d.extensions?.regex_scripts || d.extensions?.regex) unavailable.push("酒館正則／Regex（已保留來源資料，BAO/LAB 不會執行）");
    if (d.system_prompt) unavailable.push("酒館 system_prompt（已保留來源資料；角色設定已轉為 BAO/LAB 核心）");
    unavailable.push("PNG 圖片本身（只讀取 chara metadata，不會自動複製圖片）");
    const card = {
      schema_version: "1.5",
      meta: { id: makeId(name), name, title: name, category, description: description || personality || scenario, tags },
      content: { greeting, system_prompt: core.slice(0,60000), lore: book.text, author_instructions: text(d.mes_example) ? `【酒館範例對話】\n${text(d.mes_example).slice(0,30000)}` : "", creator_notes: text(d.creator_notes) },
      gameplay: { supported_modes: { immersive: true, world: Boolean(book.count) }, initial_state: { time:"未設定", location:"未設定", events:[], npcs:[], modules:{}, character_statuses:{} } },
      presentation: { supported_display: { text:true, ui:false } },
      import_metadata: { source_format:"sillytavern-v2", source_origin:origin, preserved_source:scrubSecrets(clone(raw),redacted), redacted_fields:[...new Set(redacted)], unmapped_fields:unknown, unavailable_features:unavailable }
    };
    return { converted:true, format:"SillyTavern Character Card V2", origin, character:card, report:{
      mapped:["角色名稱與描述","開場白","角色描述／性格／情境", ...(d.mes_example ? ["範例對話"] : []), ...(book.count ? [`世界書 ${book.count} 條`] : [])],
      preserved:["完整來源資料（只存本機、不送模型）", ...(unknown.length ? [`未對應欄位 ${unknown.length} 個`] : []), ...(redacted.length ? [`已遮蔽疑似憑證欄位 ${redacted.length} 個`] : [])],
      unavailable
    }};
  }
  function pngPayload(bytes) {
    const signature = [137,80,78,71,13,10,26,10];
    if (bytes.length < 20 || signature.some((v,i) => bytes[i] !== v)) throw new Error("這不是有效的 PNG 圖片。");
    const decoder = new TextDecoder("utf-8"); let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = (((bytes[offset] << 24) >>> 0) + (bytes[offset+1] << 16) + (bytes[offset+2] << 8) + bytes[offset+3]);
      if (length > MAX_METADATA_BYTES || offset + 12 + length > bytes.length) throw new Error("PNG metadata 區塊不完整或超出 1 MB 安全上限。");
      const type = decoder.decode(bytes.slice(offset+4,offset+8)), body = bytes.slice(offset+8,offset+8+length);
      if (type === "tEXt") { const split = body.indexOf(0), key = split < 0 ? "" : decoder.decode(body.slice(0,split)).toLowerCase(); if (key === "chara") return decoder.decode(body.slice(split+1)); }
      offset += 12 + length; if (type === "IEND") break;
    }
    throw new Error("這張 PNG 沒有找到 SillyTavern「chara」內嵌角色資料。截圖、轉傳或重新壓縮常會移除此資料；請使用原始 PNG 或 V2 JSON。");
  }
  function decodePayload(payload) {
    const value = text(payload); if (value.startsWith("{")) return JSON.parse(value);
    try { const binary = atob(value.replace(/\s/g,"")); return JSON.parse(new TextDecoder("utf-8").decode(Uint8Array.from(binary, c => c.charCodeAt(0)))); }
    catch { throw new Error("PNG 的 chara metadata 不是可讀取的 V2 JSON。"); }
  }
  async function parseFile(file) {
    if (!file) throw new Error("請先選擇角色卡 JSON 或 PNG。");
    const isPng = /\.png$/i.test(file.name || "") || file.type === "image/png";
    const maxSize = isPng ? MAX_PNG_BYTES : MAX_JSON_BYTES;
    if (typeof file.size === "number" && file.size > maxSize) {
      throw new Error(isPng ? "PNG 角色卡超過 10 MB，請先壓縮圖片或改用 V2 JSON。" : "角色 JSON 超過 1 MB，請先精簡後再匯入。");
    }
    if (isPng) {
      if (typeof file.arrayBuffer !== "function") throw new Error("這個瀏覽器無法讀取 PNG 角色卡。");
      return {raw:decodePayload(pngPayload(new Uint8Array(await file.arrayBuffer()))), origin:"PNG metadata"};
    }
    if (typeof file.text !== "function") throw new Error("請選擇 JSON 角色檔案。");
    try { return {raw:JSON.parse(await file.text()), origin:"JSON"}; } catch { throw new Error("JSON 語法錯誤，請確認括號、引號與逗號格式。"); }
  }
  function inspect(raw) {
    if (!object(raw)) throw new Error("角色檔案必須是單一 JSON 物件，不是陣列或故事備份。");
    if (raw.spec === "chara_card_v2" || raw.spec === "chara_card_v3") throw new Error("請使用 prepareFile 處理 SillyTavern 角色卡。");
    if (raw.schema_version && !/^1(?:\.|$)/.test(String(raw.schema_version))) throw new Error("不支援這份角色卡的 schema_version；請使用 BAO/LAB 1.x 模板。");
    if (raw.meta !== undefined && !object(raw.meta)) throw new Error("meta 必須是 JSON 物件。");
    if (raw.content !== undefined && !object(raw.content)) throw new Error("content 必須是 JSON 物件。");
    const meta=raw.meta||{}, content=raw.content||{}, id=text(meta.id||raw.id), name=text(meta.name||raw.name), greeting=text(content.greeting||raw.greeting), prompt=text(content.system_prompt||raw.system_prompt);
    const missing=[!id&&"meta.id / id",!name&&"meta.name / name",!greeting&&"content.greeting / greeting",!prompt&&"content.system_prompt / system_prompt"].filter(Boolean);
    if (missing.length) throw new Error("角色卡缺少必要欄位："+missing.join("、")+"。請先補齊再匯入。");
    if (!validId.test(id)) throw new Error("角色 ID 只能使用 1～64 字元的英數、底線及連字號，且必須以英數開頭。");
    const category=text(meta.category||raw.category).toLowerCase(); if (category && !["male","female","r18"].includes(category)) throw new Error("category 只能使用 male、female 或 r18。");
    const avatar=text(meta.avatar||raw.avatar); if (avatar && !/^(https:\/\/|assets\/)/i.test(avatar)) throw new Error("角色圖片請使用 HTTPS 網址或 assets/ 本站路徑。");
    if (raw.gameplay !== undefined && !object(raw.gameplay)) throw new Error("gameplay 必須是 JSON 物件。");
    if (raw.presentation !== undefined && !object(raw.presentation)) throw new Error("presentation 必須是 JSON 物件。");
    if (typeof engine.audit === "function") { const report=engine.audit(raw); if (!report.ok) throw new Error("角色卡結構錯誤："+report.errors.join("；")); }
    return engine.normalize(raw);
  }
  async function prepareFile(file) {
    const {raw,origin}=await parseFile(file);
    if (raw?.spec === "chara_card_v2" || raw?.spec === "chara_card_v3") { const draft=convertSillyTavern(raw,origin); inspect(draft.character); return draft; }
    return {converted:false,format:"BAO/LAB JSON",origin,character:inspect(raw),report:null};
  }
  function saveCharacter(raw) {
    const character=inspect(raw), builtin=(typeof App !== "undefined" && Array.isArray(App.characters)?App.characters:[]).some(x=>x.id===character.id&&x.source==="built-in");
    if (builtin) throw new Error("這個角色 ID 與內建作品重複；請修改 JSON 中的 meta.id，避免遮蔽原作品。");
    let existing; try { const saved=localStorage.getItem(engine.storageKey); existing=saved===null?[]:JSON.parse(saved); if(!Array.isArray(existing)) throw new Error(); } catch { throw new Error("本機角色庫無法解析；為避免覆蓋資料，本次匯入已取消。"); }
    const duplicate=existing.some(x=>x?.id===character.id);
    if (duplicate && !window.confirm(`本機已有 ID「${character.id}」的角色。確定要以新檔覆蓋角色設定嗎？現有故事存檔不會被修改。`)) throw new Error("已取消同 ID 角色覆蓋，原有資料沒有變更。");
    if (!duplicate && existing.length>=100) throw new Error("本機角色庫已達 100 張上限；請先備份並移除不需要的角色。");
    character.source="local-import"; engine.saveCustom(character);
    const persisted=engine.loadCustom().find(x=>x.id===character.id);
    if (!persisted || persisted.name!==character.name || persisted.system_prompt!==character.system_prompt || persisted.greeting!==character.greeting) throw new Error("本機儲存驗證未通過；請檢查瀏覽器儲存空間與隱私模式。");
    return character;
  }
  function preview(draft) {
    if (typeof document === "undefined") return Promise.resolve(saveCharacter(draft.character));
    return new Promise((resolve,reject) => {
      document.getElementById("bao-character-import-preview")?.remove();
      const c=draft.character, r=draft.report, list=values=>values?.length?`<ul>${values.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"<p>無</p>";
      const wrap=document.createElement("div"); wrap.id="bao-character-import-preview"; wrap.style.cssText="position:fixed;inset:0;z-index:10060;display:grid;place-items:center;padding:16px;background:#000b";
      wrap.innerHTML=`<section role="dialog" aria-modal="true" aria-label="角色卡轉換預覽" style="box-sizing:border-box;width:min(760px,100%);max-height:88dvh;overflow:auto;padding:24px;border:1px solid #62677a;border-radius:18px;background:#20232d;color:#f4f4fa"><header style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><small>LOCAL-ONLY IMPORT PREVIEW</small><h2 style="margin:5px 0">SillyTavern V2 轉換預覽</h2></div><button type="button" class="text-button" data-close>關閉</button></header><p>來源：${esc(draft.origin)}。不會呼叫 AI、不會執行卡內 HTML／JavaScript，也還沒寫入本機角色庫。</p><label>角色名稱<input data-name value="${esc(c.meta.name)}" maxlength="100" style="width:100%;box-sizing:border-box;padding:9px"></label><label>BAO/LAB 分區<select data-category style="width:100%;box-sizing:border-box;padding:9px"><option value="male" ${c.meta.category==="male"?"selected":""}>男性向</option><option value="female" ${c.meta.category==="female"?"selected":""}>女性向</option><option value="r18" ${c.meta.category==="r18"?"selected":""}>R18</option></select></label><details open><summary>開場白</summary><pre style="white-space:pre-wrap">${esc(c.content.greeting)}</pre></details><details><summary>角色核心（${c.content.system_prompt.length} 字）</summary><pre style="white-space:pre-wrap">${esc(c.content.system_prompt)}</pre></details>${c.content.lore?`<details><summary>世界書（${c.content.lore.length} 字）</summary><pre style="white-space:pre-wrap">${esc(c.content.lore)}</pre></details>`:""}<details><summary>已轉換</summary>${list(r.mapped)}</details><details><summary>已保留（只存本機）</summary>${list(r.preserved)}</details><details><summary>未直接套用</summary>${list(r.unavailable)}</details><footer style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:16px"><button type="button" class="secondary" data-cancel>取消</button><button type="button" class="primary" data-confirm>確認匯入到本機</button></footer></section>`;
      const close=()=>{wrap.remove();reject(new Error("已取消角色卡轉換，沒有寫入資料。"));};
      wrap.querySelectorAll("[data-close],[data-cancel]").forEach(x=>x.addEventListener("click",close)); wrap.addEventListener("click",e=>{if(e.target===wrap)close();});
      wrap.querySelector("[data-confirm]").addEventListener("click",()=>{const name=text(wrap.querySelector("[data-name]").value);if(!name)return;c.meta.name=c.meta.title=name;c.meta.category=wrap.querySelector("[data-category]").value;try{const saved=saveCharacter(c);wrap.remove();resolve(saved);}catch(error){reject(error);}});
      document.body.append(wrap); wrap.querySelector("[data-name]").focus();
    });
  }
  async function importFile(file) { return saveCharacter((await prepareFile(file)).character); }
  async function requestImport(file) { const draft=await prepareFile(file); return draft.converted?preview(draft):saveCharacter(draft.character); }
  engine.importFile=importFile; engine.requestImport=requestImport;
  function enhanceTools() {
    const tools=document.querySelector(".character-tools"); if(!tools||tools.dataset.importUpgrade==="1")return false;
    const advanced=tools.querySelector('a[href="data/characters/character-template.json"]');if(!advanced)return false;advanced.textContent="下載進階世界模板";
    const basic=document.createElement("a");basic.className="secondary";basic.href="data/characters/character-basic-template.json";basic.download="bao-character-basic-template.json";basic.textContent="下載基礎角色模板";advanced.before(basic);
    const note=document.createElement("p");note.className="note";note.style.width="100%";note.textContent="可匯入 BAO/LAB JSON，以及 SillyTavern V2 JSON／原始 PNG 角色卡；酒館卡會先顯示轉換預覽。所有資料只保存在這台瀏覽器。";tools.append(note);tools.dataset.importUpgrade="1";return true;
  }
  if(typeof document!=="undefined"){let attempts=0;const timer=setInterval(()=>{if(enhanceTools()||++attempts>=60)clearInterval(timer);},100);}
  window.BAOCharacterImport={inspect,parseFile,prepareFile,convertSillyTavern,importFile,requestImport,pngPayload,decodePayload};
})();
