/* BAO/LAB mascot v1: predefined lines and browser-only state; never reads story or API credentials. */
(() => {
  'use strict';
  const KEY = 'bao-lab:mascot:v1';
  const MAX_DAILY = 5;
  const safeRead = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch { return {}; }
  };
  const state = safeRead();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private browsing */ } };
  const today = () => new Date().toLocaleDateString('en-CA');
  const resetDay = () => {
    if (state.day !== today()) { state.day = today(); state.count = 0; save(); }
  };
  const lines = {
    hello: ['你回來啦！今天想先做點什麼？', '嘿嘿，包包在這裡喔。', '今天也要創造一個有趣的世界嗎？'],
    pat: ['唔……被摸摸頭了！', '再摸一下就要變回肉包了！', '嘿嘿，今天的好心情收到啦。'],
    tired: ['辛苦啦。可以先休息，故事會在這裡等你。', '今天就慢慢來吧，先喝口水也很好。', '那我先陪你待一下，不催你寫故事。']
  };
  const help = {
    api: '金鑰（API Key）是你向 AI 服務商申請的連線憑證。請在「建立故事 → 連接 AI」填入；不需要提供給包包。',
    backup: '正在玩的故事可以用「快速儲存」，重要故事也建議匯出完整備份，避免瀏覽器資料遺失。',
    memory: '記憶工作台可以整理長篇劇情的關鍵事件；包包本身不會讀取你的私人故事。'
  };
  const init = () => {
    if (document.getElementById('bao-mascot-root')) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'css/bao-mascot.css';
    document.head.appendChild(css);
    const root = document.createElement('aside');
    root.id = 'bao-mascot-root'; root.className = 'bao-mascot';
    root.setAttribute('aria-label', '包包吉祥物助手');
    root.innerHTML = `
      <button type="button" id="bao-mascot-launch" class="bao-mascot-launch" aria-label="開啟包包助手" aria-expanded="false" aria-controls="bao-mascot-panel"><img src="assets/bao-bun.svg" alt="" width="44" height="44"><span>找包包</span></button>
      <section id="bao-mascot-panel" class="bao-mascot-panel" aria-label="包包小助手" hidden>
        <header class="bao-mascot-head"><div><strong>包包 · BAO</strong><small>固定台詞小助手 · 不使用 AI／API</small></div><button id="bao-mascot-close" type="button" aria-label="關閉包包助手">✕</button></header>
        <div class="bao-mascot-body"><img class="bao-mascot-human" src="assets/bao-human.webp" width="100" height="134" alt="包包的擬人形象：奶白短髮、粉色眼睛與黑粉蝴蝶結" loading="lazy"><p id="bao-mascot-line" class="bao-mascot-line" aria-live="polite">嗨，我是包包！今天要聊聊天，還是讓我帶你認識 BAO/LAB？</p></div>
        <p id="bao-mascot-count" class="bao-mascot-count"></p>
        <div class="bao-mascot-actions"><button type="button" data-bao-talk="hello">打招呼</button><button type="button" data-bao-talk="pat">摸摸頭</button><button type="button" data-bao-talk="tired">今天好累</button></div>
        <details class="bao-mascot-help"><summary>網站小教室（不限次數）</summary><div class="bao-mascot-actions"><button type="button" data-bao-help="api">如何連接 AI？</button><button type="button" data-bao-help="backup">如何備份？</button><button type="button" data-bao-help="memory">記憶有什麼用？</button></div></details>
        <div class="bao-mascot-bottom"><a href="https://ko-fi.com/roger2486" target="_blank" rel="noopener noreferrer">支持 BAO/LAB ↗</a><button id="bao-mascot-disable" type="button">不再顯示</button></div>
        <small class="bao-mascot-disclaimer">互動次數只記錄在這台瀏覽器。支持連結不會自動記錄贊助身分。</small>
      </section>`;
    document.body.appendChild(root);
    const launch = root.querySelector('#bao-mascot-launch');
    const panel = root.querySelector('#bao-mascot-panel');
    const line = root.querySelector('#bao-mascot-line');
    const count = root.querySelector('#bao-mascot-count');
    const display = () => { resetDay(); count.textContent = `今天還能互動 ${Math.max(0, MAX_DAILY - Number(state.count || 0))} 次（每日 5 次）`; };
    const close = () => { panel.hidden = true; launch.setAttribute('aria-expanded', 'false'); launch.focus(); };
    const open = () => { display(); panel.hidden = false; launch.setAttribute('aria-expanded', 'true'); panel.querySelector('#bao-mascot-close').focus(); };
    launch.addEventListener('click', () => panel.hidden ? open() : close());
    root.querySelector('#bao-mascot-close').addEventListener('click', close);
    root.addEventListener('click', e => {
      const social = e.target.closest('[data-bao-talk]');
      if (social) {
        resetDay();
        if (Number(state.count || 0) >= MAX_DAILY) { line.textContent = '今天的五次特殊互動用完啦！明天再來找我，教學還是可以繼續看喔。'; return; }
        const kind = social.dataset.baoTalk;
        const replies = lines[kind];
        if (!replies) return;
        state.count = Number(state.count || 0) + 1;
        line.textContent = replies[(state.count - 1) % replies.length];
        save(); display();
      }
      const lesson = e.target.closest('[data-bao-help]');
      if (lesson && Object.hasOwn(help, lesson.dataset.baoHelp)) line.textContent = help[lesson.dataset.baoHelp];
    });
    const disable = root.querySelector('#bao-mascot-disable');
    const about = document.getElementById('about-view');
    const restore = document.createElement('button');
    restore.type = 'button'; restore.id = 'bao-mascot-restore'; restore.className = 'secondary';
    restore.textContent = '顯示包包小助手'; restore.hidden = true;
    about?.querySelector('.prose')?.appendChild(restore);
    const updateVisibility = () => {
      const inStory = ['chat-view', 'builder-view'].some(id => document.getElementById(id)?.classList.contains('active'));
      root.hidden = Boolean(state.disabled) || inStory;
      restore.hidden = !state.disabled;
      if (inStory || state.disabled) { panel.hidden = true; launch.setAttribute('aria-expanded', 'false'); }
    };
    disable.addEventListener('click', () => { state.disabled = true; save(); updateVisibility(); });
    restore.addEventListener('click', () => { state.disabled = false; save(); updateVisibility(); open(); });
    ['chat-view','builder-view'].forEach(id => {
      const el = document.getElementById(id);
      if (el) new MutationObserver(updateVisibility).observe(el, { attributes:true, attributeFilter:['class'] });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
    display(); updateVisibility();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();