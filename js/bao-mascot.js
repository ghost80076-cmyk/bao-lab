/* BAO/LAB mascot: local-only dual-form sprite animations.
 * Never reads story contents, API credentials, or sends model requests. */
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
    css.rel = 'stylesheet'; css.href = 'css/bao-mascot.css?v=5';
    document.head.appendChild(css);
    const root = document.createElement('aside');
    root.id = 'bao-mascot-root'; root.className = 'bao-mascot';
    root.setAttribute('aria-label', '包包吉祥物助手');
    root.innerHTML = `
      <button type="button" id="bao-mascot-launch" class="bao-mascot-launch" aria-label="開啟包包助手" aria-expanded="false" aria-controls="bao-mascot-panel">
        <span class="bao-mascot-avatar">${window.BAOCharacter.markup()}</span><span class="bao-mascot-launch-label">找包包</span>
      </button>
      <section id="bao-mascot-panel" class="bao-mascot-panel" aria-label="包包小助手" hidden>
        <header class="bao-mascot-head"><div><strong>包包 · BAO</strong><small>固定台詞小助手 · 不使用 AI／API</small></div><button id="bao-mascot-close" type="button" aria-label="關閉包包助手">✕</button></header>
        <div class="bao-mascot-body"><div class="bao-mascot-stage">${window.BAOCharacter.markup()}</div><p id="bao-mascot-line" class="bao-mascot-line" aria-live="polite">嗨，我是包包！今天要聊聊天，還是讓我帶你認識夜灣？</p></div>
        <p id="bao-mascot-count" class="bao-mascot-count"></p>
        <div class="bao-mascot-actions"><button type="button" data-bao-talk="hello">打招呼</button><button type="button" data-bao-talk="pat">摸摸頭</button><button type="button" data-bao-talk="tired">今天好累</button></div>
        <div class="bao-mascot-controls"><button type="button" id="bao-mascot-transform" aria-pressed="false">變成人形</button><button type="button" id="bao-mascot-motion" aria-pressed="true">關閉動畫</button></div>
        <p id="bao-mascot-form-note" class="bao-mascot-form-note">肉包型態：眨眼、漂浮與點擊反應在本機執行。</p>
        <details class="bao-mascot-help"><summary>網站小教室（不限次數）</summary><div class="bao-mascot-actions"><button type="button" data-bao-help="api">如何連接 AI？</button><button type="button" data-bao-help="backup">如何備份？</button><button type="button" data-bao-help="memory">記憶有什麼用？</button></div></details>
        <p class="bao-mascot-form-note"><a href="bao-room/">雙型態互動室：變身與表情 ↗</a></p>
        <div class="bao-mascot-bottom"><a href="https://ko-fi.com/roger2486" target="_blank" rel="noopener noreferrer" aria-label="投餵肉包・支持夜灣">${window.BAOCharacter.markup('bun', 'bao-support-icon')} 投餵肉包 ↗</a><button id="bao-mascot-disable" type="button">不再顯示</button></div>
        <small class="bao-mascot-disclaimer">動畫與型態偏好只存在這台瀏覽器。雙型態採用表情幀動畫，非 Live2D；不會讀取故事或連線金鑰。</small>
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
      note.textContent = human ? '人形型態：呼吸、眨眼與表情幀動畫；Live2D 尚未製作。' : '肉包型態：眨眼、漂浮與表情反應在本機執行。';
      window.BAOCharacter.motion(Boolean(state.motionOff));
      window.BAOCharacter.set(root, human ? 'human' : 'bun');
      window.dispatchEvent(new CustomEvent('bao:appearance', { detail: { form: human ? 'human' : 'bun', motionOff: Boolean(state.motionOff) } }));
      motion.textContent = reduced() ? '系統已關閉動畫' : state.motionOff ? '開啟動畫' : '關閉動畫';
      motion.disabled = reduced();
      motion.setAttribute('aria-pressed', String(!state.motionOff && !reduced()));
      count.textContent = `今天還能互動 ${Math.max(0, MAX_DAILY - Number(state.count || 0))} 次（每日 5 次；摸頭動畫與變身不限次數）`;
      launch.setAttribute('aria-label', human ? '開啟包包助手（人形型態）' : '開啟包包助手（肉包型態）');
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
        window.BAOCharacter.set(root, state.form, kind === 'tired' ? 3 : kind === 'pat' ? 1 : 4);
      }
      const lesson = e.target.closest('[data-bao-help]');
      if (lesson && Object.hasOwn(help, lesson.dataset.baoHelp)) { line.textContent = help[lesson.dataset.baoHelp]; window.BAOCharacter.set(root, state.form, 2); }
    });
    transform.addEventListener('click', () => {
      state.form = state.form === 'human' ? 'bun' : 'human';
      save(); animate(); render();
      line.textContent = state.form === 'human' ? '變身！換個模樣，還是同一個包包。' : '噗咻！回到小小的肉包型態啦。';
    });
    motion.addEventListener('click', () => { if (reduced()) return; state.motionOff = !state.motionOff; save(); render(); });
    reduce?.addEventListener?.('change', render);
    window.addEventListener('bao:request-form', event => {
      if (!['bun', 'human'].includes(event.detail?.form)) return;
      state.form = event.detail.form; save(); render();
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