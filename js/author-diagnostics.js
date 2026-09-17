/* BAO/LAB character structure diagnostics and keyless relay probe. */
(() => {
  if (typeof CharacterEngine === 'undefined') return;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' ? value.trim() : '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MAX_SIZE = 1024 * 1024;
  function inspect(raw) {
    const issues = [];
    const add = (severity, path, problem, fix) => issues.push({ severity, path, problem, fix });
    const has = (parent, name) => object(parent) && Object.prototype.hasOwnProperty.call(parent, name);
    if (!object(raw)) {
      add('error', '$', '角色卡必須是單一 JSON 物件。', '請使用 BAO/LAB 基礎或進階模板；不可直接匯入故事備份或 JSON 陣列。');
      return { importable: false, issues, score: null };
    }
    if (/^chara_card_v[23]$/.test(String(raw.spec || '')) || object(raw.data) && text(raw.data.name)) {
      add('error', '$.spec', '這是其他平台的角色卡格式。', 'BAO/LAB 尚未支援酒館角色卡自動轉換；請先轉成 BAO/LAB JSON，避免設定遺失。');
      return { importable: false, issues, score: null };
    }
    if (raw.schema_version && !/^1(?:\.|$)/.test(String(raw.schema_version))) add('error', '$.schema_version', '不支援這個角色卡版本。', '請使用 BAO/LAB 1.x 模板，不要直接更改版本字串來假裝相容。');
    for (const field of ['meta', 'content', 'gameplay', 'presentation']) {
      if (has(raw, field) && !object(raw[field])) add('error', '$.' + field, '資料型態必須是 JSON 物件。', '將此欄改為以 { 開頭、以 } 結尾的物件；不要使用陣列或文字。');
    }
    if (issues.some(item => item.severity === 'error' && item.path !== '$.schema_version')) return { importable: false, issues, score: null };
    const meta = object(raw.meta) ? raw.meta : {};
    const content = object(raw.content) ? raw.content : {};
    const gameplay = object(raw.gameplay) ? raw.gameplay : {};
    const display = object(raw.presentation) ? raw.presentation : {};
    const required = [
      ['$.meta.id', text(meta.id || raw.id), '填入唯一的英數 ID，例如 my-character；已存在的本機 ID 匯入時會要求確認。'],
      ['$.meta.name', text(meta.name || raw.name), '填寫玩家在作品列表看到的角色姓名。'],
      ['$.content.greeting', text(content.greeting || raw.greeting), '加入實際開場白，說明當下場景及角色動作。'],
      ['$.content.system_prompt', text(content.system_prompt || raw.system_prompt), '描述角色人格、行為規則與資訊邊界；不要留空。']
    ];
    required.forEach(([path, value, fix]) => { if (!value) add('error', path, '缺少必填文字。', fix); });
    const id = required[0][1];
    if (id && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) add('error', '$.meta.id', 'ID 含有不允許的字元或長度超出範圍。', '使用 1～64 個英數、底線或連字號，並以英數開頭。');
    const category = text(meta.category || raw.category).toLowerCase();
    if (category && !['male', 'female', 'r18'].includes(category)) add('error', '$.meta.category', '不支援的作品分類。', '請填 male、female 或 r18；這是作品受眾分類，不是角色性別。');
    const avatar = text(meta.avatar || raw.avatar);
    if (avatar && !/^(https:\/\/|assets\/)/i.test(avatar)) add('error', '$.meta.avatar', '圖片來源格式不支援。', '改用 https:// 開頭的圖片連結或 assets/ 本站圖片路徑。');
    if (!text(meta.description || raw.description)) add('notice', '$.meta.description', '尚未填寫作品列表簡介。', '補一句作品定位；不影響匯入與聊天。');
    const modes = object(gameplay.supported_modes) ? gameplay.supported_modes : {};
    if (modes.world === true && !text(content.world || raw.world)) add('notice', '$.content.world', '已啟用世界模擬，但沒有世界背景。', '說明世界規則與邊界；單角色作品可關閉 world 模式。');
    const status = object(gameplay.character_status) ? gameplay.character_status : {};
    if (status.enabled === true && (!Array.isArray(status.fields) || !status.fields.length)) add('notice', '$.gameplay.character_status.fields', '狀態欄已啟用，但沒有欄位。', '建立至少一個欄位，或將 character_status.enabled 改成 false。');
    const panels = object(display.supported_display) ? display.supported_display : {};
    if (panels.text === false && panels.ui === false) add('error', '$.presentation.supported_display', '純文字及互動 UI 都被關閉。', '至少啟用 text 或 ui 其中一項。');
    const styles = object(display.narrative) ? display.narrative : {};
    if (has(styles, 'recommended_styles') && !Array.isArray(styles.recommended_styles)) add('notice', '$.presentation.narrative.recommended_styles', '文風包應為可複選的陣列。', '例如 ["電影感", "慢節奏"]；不想指定時使用 []。');
    const modules = Array.isArray(gameplay.world_modules) ? gameplay.world_modules : [];
    const moduleIds = new Set();
    modules.forEach((module, index) => {
      const path = `$.gameplay.world_modules[${index}]`;
      const id = text(module?.id);
      if (!id) add('error', `${path}.id`, '世界模組缺少 ID。', '為每個模組填寫唯一且固定的 id。');
      else if (moduleIds.has(id)) add('error', `${path}.id`, `世界模組 ID「${id}」重複。`, '更換重複的 id，並同步更新初始狀態的引用。');
      moduleIds.add(id);
      const keys = new Set();
      (Array.isArray(module?.fields) ? module.fields : []).forEach((field, fieldIndex) => {
        const key = text(field?.key);
        const fieldPath = `${path}.fields[${fieldIndex}].key`;
        if (!key) add('error', fieldPath, '欄位缺少 key。', '補上同模組內唯一的英文 key。');
        else if (keys.has(key)) add('error', fieldPath, `欄位 key「${key}」重複。`, '同一模組內每個欄位須使用不同 key。');
        keys.add(key);
      });
    });
    const initial = object(gameplay.initial_state) ? gameplay.initial_state : {};
    if (object(initial.modules)) Object.keys(initial.modules).forEach(id => {
      if (!moduleIds.has(id)) add('notice', `$.gameplay.initial_state.modules.${id}`, '初始狀態引用了未定義的世界模組。', `在 world_modules 補上 id「${id}」，或移除此初始值。`);
    });
    let score = null;
    try {
      if (typeof CharacterEngine.audit === 'function') {
        const report = CharacterEngine.audit(raw);
        score = Number.isFinite(report?.score) ? report.score : null;
        (report?.errors || []).forEach(problem => {
          if (!issues.some(item => item.problem === problem)) add('error', '$', String(problem), '參照訊息中的欄位名稱，到進階模板對應區塊修正。');
        });
      }
    } catch {
      add('error', '$', '既有角色規格檢查無法解析此檔案。', '檢查巢狀物件、陣列與型別是否符合模板；不要直接匯入。');
    }
    return { importable: !issues.some(item => item.severity === 'error'), issues, score };
  }
  function parse(value) {
    if (typeof value !== 'string') throw new Error('檔案內容必須是 UTF-8 JSON 文字。');
    try { return JSON.parse(value); }
    catch (error) {
      const match = /position\s+(\d+)/i.exec(error.message || '');
      let location = '';
      if (match) {
        const position = Math.min(value.length, Number(match[1]));
        const prefix = value.slice(0, position);
        location = `（第 ${prefix.split('\n').length} 行、第 ${prefix.length - prefix.lastIndexOf('\n')} 欄附近）`;
      }
      throw new Error(`JSON 語法錯誤${location}。請檢查括號、引號及尾端多餘逗號。`);
    }
  }
  function reportHTML(report, name = '角色卡') {
    const errors = report.issues.filter(item => item.severity === 'error');
    const notices = report.issues.filter(item => item.severity !== 'error');
    const rows = items => items.length ? `<ul style="padding-left:20px">${items.map(item => `<li style="margin:10px 0"><code style="overflow-wrap:anywhere">${esc(item.path)}</code><br><b>${esc(item.problem)}</b><br><span>${esc(item.fix)}</span></li>`).join('')}</ul>` : '<p class="note">無。</p>';
    return `<div class="eyebrow">BAO/LAB CHARACTER STRUCTURE</div><h2 style="margin:4px 0">${esc(name)}</h2><p><b>${report.importable ? '✓ 結構可匯入' : '✕ 尚不可匯入'}</b> · ${errors.length} 項必修 · ${notices.length} 項提醒</p><p class="note">這只檢查 JSON 結構，不會呼叫 AI，也無法保證角色扮演品質。${report.score === null ? '' : `原有覆蓋度參考：${report.score}/100；不代表模型演出分數。`}</p><h3>必須修正</h3>${rows(errors)}<h3>可選改善</h3>${rows(notices)}<p class="note">模板：<a href="data/characters/character-basic-template.json" download="bao-character-basic-template.json">基礎角色</a> · <a href="data/characters/character-template.json" download="bao-character-advanced-template.json">進階世界</a></p>`;
  }
  function show(report, name) {
    document.getElementById('bao-character-audit-modal')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'bao-character-audit-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px';
    wrap.innerHTML = `<section role="dialog" aria-modal="true" aria-label="角色卡結構檢查" style="width:min(760px,100%);max-height:88vh;overflow:auto;background:var(--panel,#151515);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:24px"><button type="button" class="text-button" data-close style="float:right">關閉</button>${reportHTML(report, name)}</section>`;
    const close = () => wrap.remove();
    wrap.querySelector('[data-close]').onclick = close;
    wrap.addEventListener('click', event => { if (event.target === wrap) close(); });
    document.body.appendChild(wrap);
  }
  function mountAudit() {
    const button = document.querySelector('[data-character-audit]');
    const tools = button?.closest('.character-tools');
    const input = tools?.querySelector('input[type="file"]:not(#import-character-file)');
    if (!button || !input || input.dataset.guidanceReady === '1') return false;
    button.textContent = '檢查角色卡結構';
    input.dataset.guidanceReady = '1';
    input.dataset.characterAuditFile = 'true';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_SIZE) throw new Error('檔案超過 1 MB；請先縮小角色卡。');
        show(inspect(parse(await file.text())), file.name);
      } catch (error) {
        show({ importable: false, score: null, issues: [{ severity: 'error', path: '$', problem: error.message || '無法讀取 JSON。', fix: '確認檔案是 UTF-8 編碼的 BAO/LAB JSON。' }] }, file.name);
      } finally { input.value = ''; }
    };
    return true;
  }
  function validEndpoint(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return null;
      return url;
    } catch { return null; }
  }
  async function probeRelay(endpoint, request = fetch) {
    const url = validEndpoint(endpoint);
    if (!url) return { reachable: false, kind: 'config', message: '請填入完整 HTTPS API 端點，不能包含帳密、查詢參數或片段。' };
    const started = Date.now();
    try {
      const response = await request(url.href, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer BAO_LAB_INVALID_PROBE_KEY' },
        body: JSON.stringify({ model: 'bao-lab-unauthenticated-probe', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
      });
      return { reachable: true, kind: 'http', status: response.status, ms: Date.now() - started,
        message: `瀏覽器已收到 HTTP ${response.status}；此結果僅代表這次無真實 Key 的連通檢查可讀到回應，不代表金鑰、模型或 Streaming 可用。` };
    } catch {
      return { reachable: false, kind: 'network', ms: Date.now() - started,
        message: '瀏覽器未取得可讀回應；可能是 CORS、網路、DNS、TLS 或中轉商封鎖。不能據此判定 Key 有問題。' };
    }
  }
  function mountRelay() {
    const parent = document.getElementById('provider-diagnostics-box');
    if (!parent || parent.querySelector('[data-relay-probe]')) return false;
    const section = document.createElement('section');
    section.className = 'note';
    section.style.marginTop = '12px';
    section.innerHTML = '<h4>第三方中轉：瀏覽器連通檢查</h4><p>請先在 Custom Provider 填入中轉商提供的完整 HTTPS Chat Completions 端點（不是註冊頁或只有網域的網址）。按下檢查才會送出一筆使用固定假 Key 的請求；不會讀取或傳送你輸入的真實 API Key，服務商仍可能記錄請求。成功也不代表模型驗收通過。</p><button type="button" class="secondary" data-relay-probe>不使用真實 Key 檢查端點</button> <span data-relay-probe-status aria-live="polite">尚未檢查</span><p>要驗證實際模型與 SSE，仍須使用上方「完整驗收目前 API」。請不要把第三方中轉的 Key 貼在聊天裡。</p>';
    parent.appendChild(section);
    const button = section.querySelector('[data-relay-probe]');
    const status = section.querySelector('[data-relay-probe-status]');
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = '正在檢查…';
      const endpoint = document.getElementById('base-url')?.value || '';
      try { status.textContent = (await probeRelay(endpoint)).message; }
      finally { button.disabled = false; }
    });
    return true;
  }
  if (typeof document !== 'undefined' && typeof setInterval === 'function') {
    let attempts = 0;
    const timer = setInterval(() => { mountAudit(); mountRelay(); if (++attempts >= 60) clearInterval(timer); }, 150);
  }
  window.BAOAuthorDiagnostics = { inspect, parse, reportHTML, probeRelay, validEndpoint, mountAudit, mountRelay };
})();