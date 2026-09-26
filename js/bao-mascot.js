/* BAO/LAB mascot: local-only SVG animations and optional static human preview.
 * Never reads story contents, API credentials, or sends network requests. */
(() => {
  'use strict';
  const KEY = 'bao-lab:mascot:v1';
  const MAX_DAILY = 5;
  const HUMAN = 'assets/bao-human-v2.webp';
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
  // Match assets/bao-bun.svg; inline SVG lets the eyes blink without an API or canvas.
  const bun = `<svg class="bao-bun-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 108" aria-hidden="true" focusable="false">
    <path d="M29 24c-3-9 1-15 9-17 7-1 11 3 13 9 3-11 12-13 19-8 5 3 6 10 2 17C90 32 102 50 102 70c0 25-17 33-46 33S10 95 10 70c0-20 8-39 19-46Z" fill="#fffaf9" stroke="#574451" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 23c-2-7 0-10 5-13m16 13c0-8 2-13 8-14" fill="none" stroke="#eec6d5" stroke-width="2.4" stroke-linecap="round"/>
    <g class="bao-bun-eyes"><circle cx="36" cy="65" r="3.5" fill="#372d36"/><circle cx="76" cy="65" r="3.5" fill="#372d36"/></g>
    <ellipse cx="25" cy="75" rx="9" ry="6" fill="#f7bad3" opacity=".8"/><ellipse cx="87" cy="75" rx="9" ry="6" fill="#f7bad3" opacity=".8"/>
    <path class="bao-bun-mouth" d="M49 74q7 9 14 0" fill="none" stroke="#493440" stroke-width="2.7" stroke-linecap="round"/>
    <path d="M55 99q-17-14-24-5-5 10 15 12l10-5q18 10 25 0 1-14-25-2Z" fill="#382e3b" stroke="#f5a7ce" stroke-width="1.5"/><circle cx="56" cy="101" r="3" fill="#f4a4c9"/>
  </svg>`;
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
    css.rel = 'stylesheet'; css.href = 'css/bao-mascot.css?v=3';
    document.head.appendChild(css);
    const root = document.createElement('aside');
    root.id = 'bao-mascot-root'; root.className = 'bao-mascot';
    root.setAttribute('aria-label', '包包吉祥物助手');
    root.innerHTML = `
      <button type="button" id="bao-mascot-launch" class="bao-mascot-launch" aria-label="開啟包包助手" aria-expanded="false" aria-controls="bao-mascot-panel">
        <span class="bao-mascot-avatar"><span class="bao-mascot-bun">${bun}</span><img class="bao-mascot-avatar-human" src="${HUMAN}" alt="" width="44" height="44" loading="lazy"></span><span class="bao-mascot-launch-label">找包包</span>
      </button>
      <section id="bao-mascot-panel" class="bao-mascot-panel" aria-label="包包小助手" hidden>
        <header class="bao-mascot-head"><div><strong>包包 · BAO</strong><small>固定台詞小助手 · 不使用 AI／API</small></div><button id="bao-mascot-close" type="button" aria-label="關閉包包助手">✕</button></header>
        <div class="bao-mascot-body"><div class="bao-mascot-stage"><span class="bao-mascot-bun">${bun}</span><img class="bao-mascot-human" src="${HUMAN}" width="100" height="134" alt="包包人形立繪：奶白短髮、粉紫眼睛、黑粉蝴蝶結" loading="lazy"></div><p id="bao-mascot-line" class="bao-mascot-line" aria-live="polite">嗨，我是包包！今天要聊聊天，還是讓我帶你認識 BAO/LAB？</p></div>
        <p id="bao-mascot-count" class="bao-mascot-count"></p>
        <div class="bao-mascot-actions"><button type="button" data-bao-talk="hello">打招呼</button><button type="button" data-bao-talk="pat">摸摸頭</button><button type="button" data-bao-talk="tired">今天好累</button></div>
        <div class="bao-mascot-controls"><button type="button" id="bao-mascot-transform" aria-pressed="false">變成人形</button><button type="button" id="bao-mascot-motion" aria-pressed="true">關閉動畫</button></div>
        <p id="bao-mascot-form-note" class="bao-mascot-form-note">肉包型態：眨眼、漂浮與點擊反應在本機執行。</p>
        <details class="bao-mascot-help"><summary>網站小教室（不限次數）</summary><div class="bao-mascot-actions"><button type="button" data-bao-help="api">如何連接 AI？</button><button type="button" data-bao-help="backup">如何備份？</button><button type="button" data-bao-help="memory">記憶有什麼用？</button></div></details>
        <div class="bao-mascot-bottom"><a href="https://ko-fi.com/roger2486" target="_blank" rel="noopener noreferrer">支持 BAO/LAB ↗</a><button id="bao-mascot-disable" type="button">不再顯示</button></div>
        <small class="bao-mascot-disclaimer">動畫與型態偏好只存在這台瀏覽器。人形目前是靜態預覽，非 Live2D；不會讀取故事或連線金鑰。</small>
      </section>`;
    document.body.appendChild(root);
    const launch = root.querySelector('#bao-mascot-launch');
    const panel = root.querySelector('#bao-mascot-panel');
    const line = root.querySelector('#bao-mascot-line');
    const count = root.querySelector('#bao-mascot-count');
    const transform = root.querySelector('#bao-mascot-transform');
    const motion = root.querySelector('#bao-mascot-motion');
    const note = root.querySelector('#bao-mascot-form-note');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = () => Boolean(reduce?.matches);
    const animate = () => {
      if (state.motionOff || reduced()) return;
      root.classList.remove('bao-mascot--tap');
      void root.offsetWidth;
      root.classList.add('bao-mascot--tap');
    };
    root.addEventListener('animationend', event => {
      if (event.animationName === 'bao-bun-tap') root.classList.remove('bao-mascot--tap');
    });
    const render = () => {
      resetDay();
      const human = state.form === 'human';
      root.classList.toggle('bao-mascot--human', human);
      root.classList.toggle('bao-mascot--still', Boolean(state.motionOff) || reduced());
      transform.textContent = human ? '變回肉包' : '變成人形';
      transform.setAttribute('aria-pressed', String(human));
      note.textContent = human ? '人形型態目前使用定稿立繪預覽，Live2D 尚未製作。' : '肉包型態：眨眼、漂浮與點擊反應在本機執行。';
      motion.textContent = reduced() ? '系統已關閉動畫' : state.motionOff ? '開啟動畫' : '關閉動畫';
      motion.disabled = reduced();
      motion.setAttribute('aria-pressed', String(!state.motionOff && !reduced()));
      count.textContent = `今天還能互動 ${Math.max(0, MAX_DAILY - Number(state.count || 0))} 次（每日 5 次；摸頭動畫與變身不限次數）`;
      launch.setAttribute('aria-label', human ? '開啟包包助手（人形預覽）' : '開啟包包助手（肉包型態）');
    };
    const close = () => { panel.hidden = true; launch.setAttribute('aria-expanded', 'false'); launch.focus(); };
    const open = () => { render(); panel.hidden = false; launch.setAttribute('aria-expanded', 'true'); panel.querySelector('#bao-mascot-close').focus(); };
    launch.addEventListener('click', () => { animate(); panel.hidden ? open() : close(); });
    root.querySelector('#bao-mascot-close').addEventListener('click', close);
    root.addEventListener('click', e => {
      const social = e.target.closest('[data-bao-talk]');
      if (social) {
        const kind = social.dataset.baoTalk;
        const replies = lines[kind];
        if (!replies) return;
        animate();
        resetDay();
        if (Number(state.count || 0) >= MAX_DAILY) {
          line.textContent = kind === 'pat' ? '摸摸頭收到啦！今天的固定台詞用完了，動作還是可以繼續玩喔。' : '今天的五次特殊互動用完啦！明天再來找我，教學還是可以繼續看喔。';
          return;
        }
        state.count = Number(state.count || 0) + 1;
        line.textContent = replies[(state.count - 1) % replies.length];
        save(); render();
      }
      const lesson = e.target.closest('[data-bao-help]');
      if (lesson && Object.hasOwn(help, lesson.dataset.baoHelp)) line.textContent = help[lesson.dataset.baoHelp];
    });
    transform.addEventListener('click', () => {
      state.form = state.form === 'human' ? 'bun' : 'human';
      save(); animate(); render();
      line.textContent = state.form === 'human' ? '變身！這是我的人形立繪預覽，正式 Live2D 還在準備中。' : '噗咻！回到小小的肉包型態啦。';
    });
    motion.addEventListener('click', () => { if (reduced()) return; state.motionOff = !state.motionOff; save(); render(); });
    reduce?.addEventListener?.('change', render);
    root.querySelectorAll('.bao-mascot-avatar-human,.bao-mascot-human').forEach(img => {
      img.addEventListener('error', () => { img.hidden = true; root.classList.add('bao-mascot--no-human'); });
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
    render(); updateVisibility();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();