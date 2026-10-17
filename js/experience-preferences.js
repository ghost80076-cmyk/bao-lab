/* YoruBay UI experience: theme + disclosure preferences only. No story, API or prompt mutations. */
(() => {
  'use strict';
  if (window.YoruExperience || !window.YoruExperienceCore) return;
  const core = window.YoruExperienceCore;
  const KEY = 'yorubay:experience:v1';
  const readStorage = () => {
    try { return core.normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); }
    catch (_) { return core.normalize(null); }
  };
  let current = readStorage();
  let dialog = null;
  let returnFocus = null;
  const read = () => ({ ...current });
  const apply = () => {
    document.documentElement.dataset.yoruTheme = current.theme;
    document.documentElement.dataset.yoruExperience = current.level;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content =
      ({ night: '#15191d', mist: '#f5f0e9', dawn: '#edf3f5', dusk: '#302c3c', sunset: '#fff0df' })[current.theme];
  };
  const choose = changes => {
    const next = core.normalize({ ...current, ...(changes || {}) });
    if (next.theme === current.theme && next.level === current.level) return read();
    current = next;
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (_) { /* private mode */ }
    apply();
    window.dispatchEvent(new CustomEvent('yoru:experience-change', { detail: read() }));
    return read();
  };
  const makeStyles = () => {
    if (document.querySelector('link[href^="css/experience-preferences.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/experience-preferences.css?v=5';
    document.head.append(link);
  };
  const close = () => {
    if (dialog?.open) dialog.close();
    returnFocus?.focus?.();
  };
  const ensureDialog = () => {
    if (dialog?.isConnected) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'yoru-experience-dialog';
    dialog.setAttribute('aria-labelledby', 'yoru-experience-title');
    dialog.innerHTML = [
      '<div class="yoru-exp-content">',
      '<header><div><small>YOUR YORUBAY</small><h2 id="yoru-experience-title">外觀與操作</h2>',
      '<p>讓夜灣符合你的閱讀習慣。隨時可以更換，不影響故事內容與設定。</p></div>',
      '<button type="button" class="yoru-exp-close" data-exp-close aria-label="關閉">×</button></header>',
      '<fieldset><legend>畫面主題</legend><p class="yoru-exp-hint">整個網站一起切換；不是只改聊天背景。</p>',
      '<div class="yoru-exp-options yoru-exp-themes">',
      '<label data-exp-theme="night"><input type="radio" name="yoru-theme" value="night"><span class="yoru-exp-swatch night"></span><strong>夜港</strong><small>沉靜夜讀</small></label>',
      '<label data-exp-theme="mist"><input type="radio" name="yoru-theme" value="mist"><span class="yoru-exp-swatch mist"></span><strong>月白</strong><small>柔暖紙頁</small></label>',
      '<label data-exp-theme="dawn"><input type="radio" name="yoru-theme" value="dawn"><span class="yoru-exp-swatch dawn"></span><strong>晨霧</strong><small>微藍曦光</small></label>',
      '<label data-exp-theme="dusk"><input type="radio" name="yoru-theme" value="dusk"><span class="yoru-exp-swatch dusk"></span><strong>暮霞</strong><small>灰紫暮色</small></label>',
      '<label data-exp-theme="sunset"><input type="radio" name="yoru-theme" value="sunset"><span class="yoru-exp-swatch sunset"></span><strong>夕燈</strong><small>杏橘餘暉</small></label>',
      '</div></fieldset>',
      '<fieldset><legend>工具呈現</legend><p class="yoru-exp-hint">所有功能都會保留；差別只是初次展開多少工具。</p>',
      '<div class="yoru-exp-options yoru-exp-levels">',
      '<label><input type="radio" name="yoru-level" value="easy"><span><strong>輕鬆</strong><small>專心閱讀，其他工具收好</small></span></label>',
      '<label><input type="radio" name="yoru-level" value="standard"><span><strong>標準</strong><small>常用的世界與故事設定</small></span></label>',
      '<label><input type="radio" name="yoru-level" value="pro"><span><strong>專業</strong><small>完整工具與技術設定</small></span></label>',
      '</div></fieldset>',
      '<footer><span>這台裝置專用 · 不上傳故事與金鑰</span>',
      '<button type="button" class="primary" data-exp-close>完成</button></footer>',
      '</div>'
    ].join('');
    dialog.addEventListener('change', event => {
      if (!event.target.matches('input[type="radio"]')) return;
      if (event.target.name === 'yoru-theme') choose({ theme: event.target.value });
      if (event.target.name === 'yoru-level') choose({ level: event.target.value });
    });
    dialog.querySelectorAll('[data-exp-close]').forEach(button => button.addEventListener('click', close));
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => { returnFocus?.focus?.(); });
    document.body.append(dialog);
    return dialog;
  };
  const open = () => {
    makeStyles();
    returnFocus = document.activeElement;
    const node = ensureDialog();
    node.querySelector('input[name="yoru-theme"][value="' + current.theme + '"]').checked = true;
    node.querySelector('input[name="yoru-level"][value="' + current.level + '"]').checked = true;
    if (!node.open) node.showModal();
    node.querySelector('[data-exp-close]')?.focus();
  };
  const ensureEntry = () => {
    const topbar = document.querySelector('.topbar');
    if (!topbar || topbar.querySelector('#yoru-experience-open')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'yoru-experience-open';
    button.className = 'yoru-exp-entry';
    button.innerHTML = '<span class="yoru-exp-symbol" aria-hidden="true">◐</span><span class="yoru-exp-label">外觀</span>';
    button.title = '外觀與操作';
    button.setAttribute('aria-label', '外觀與操作設定');
    button.addEventListener('click', open);
    topbar.append(button);
  };
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    current = readStorage();
    apply();
    window.dispatchEvent(new CustomEvent('yoru:experience-change', { detail: read() }));
  });
  window.YoruExperience = Object.freeze({ get: read, choose, open });
  apply();
  makeStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureEntry, { once: true });
  else ensureEntry();
})();
