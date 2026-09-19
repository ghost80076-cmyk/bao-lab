/* Keep API failures out of the committed story and expose in-story controls. */
(() => {
  'use strict';
  if (!window.App || !window.Chat || window.BAOChatExperienceRepairs) return;
  const $ = id => document.getElementById(id);
  const esc = value => App.escapeHTML(String(value ?? ''));
  const chat = $('chat-view');
  const stream = $('chat-stream');
  const composer = chat?.querySelector('.composer');
  if (!chat || !stream || !composer) return;

  const styles = document.createElement('style');
  styles.id = 'bao-chat-experience-repairs-style';
  styles.textContent = `
    #chat-view #bao-chat-top{display:none!important}
    #bao-chat-floating-actions{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:calc(94px + env(safe-area-inset-bottom));z-index:148;display:flex;flex-direction:column;align-items:flex-end;gap:9px;pointer-events:none}
    #chat-view:not(.active) #bao-chat-floating-actions{display:none}
    #bao-chat-floating-actions :is(button,a){pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:auto;min-height:42px;max-width:165px;padding:9px 13px;border:1px solid #6c7b89;border-radius:999px;background:#1a2630;color:#f6fafb;font:600 13px/1.3 inherit;text-decoration:none;box-shadow:0 6px 22px #0009;cursor:pointer}
    #bao-chat-floating-actions :is(button,a):focus-visible{outline:3px solid #70e3d1;outline-offset:3px}
    #bao-chat-floating-actions a img{width:20px;height:20px}
    #bao-chat-send-feedback{margin:8px 0;padding:10px 13px;border:1px solid #9c7957;border-radius:10px;background:#322820;color:#ffddb9;font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
    #bao-chat-cost-backdrop{position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;padding:14px;background:#000c}
    #bao-chat-cost-dialog{box-sizing:border-box;width:min(100%,620px);max-height:calc(100dvh - 28px);overflow:auto;background:#20232d;color:#f4f4fa;border:1px solid #62677a;border-radius:16px;padding:clamp(16px,3vw,26px);box-shadow:0 16px 52px #0009}
    #bao-chat-cost-dialog header,#bao-chat-cost-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    #bao-chat-cost-dialog h2{font-size:21px;margin:0}
    #bao-chat-cost-dialog p{line-height:1.6;font-size:13px;color:#d4d7e4}
    #bao-chat-cost-dialog form{display:grid;gap:13px}
    #bao-chat-cost-dialog fieldset{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding:12px;border:1px solid #656b7b;border-radius:10px}
    #bao-chat-cost-dialog legend{padding:0 6px;font-weight:700}
    #bao-chat-cost-dialog label{display:grid;gap:5px;font-size:13px;min-width:0}
    #bao-chat-cost-dialog input,#bao-chat-cost-dialog select{box-sizing:border-box;width:100%;min-width:0;padding:9px;border:1px solid #777d91;border-radius:8px;background:#141720;color:white;font:inherit}
    #bao-chat-cost-dialog footer button{width:auto;min-height:41px}
    #bao-chat-cost-error{color:#ffcc93!important;margin:0}
    #bao-chat-cost-open{width:auto;min-height:38px}
    @media(max-width:600px){#bao-chat-floating-actions{right:10px;bottom:calc(116px + env(safe-area-inset-bottom))}#bao-chat-floating-actions :is(button,a){min-height:40px;padding:8px 11px}#bao-chat-cost-dialog fieldset{grid-template-columns:1fr}}
  `;
  document.head.append(styles);

  const feedback = document.createElement('div');
  feedback.id = 'bao-chat-send-feedback';
  feedback.setAttribute('role', 'alert');
  feedback.hidden = true;
  composer.before(feedback);
  const showFailure = message => {
    feedback.textContent = message;
    feedback.hidden = false;
  };
  const clearFailure = () => { feedback.textContent = ''; feedback.hidden = true; };
  const failureMessage = text => /^(?:連線失敗[：:]|已取消本次生成。)/.test(text);
  const originalSend = App.sendMessage;
  App.sendMessage = async function(...args) {
    const priorNodes = new Set(stream.querySelectorAll(':scope > .message'));
    const priorCount = Chat.messages.length;
    const attempted = Boolean($('user-input')?.value.trim());
    if (attempted && !this.__requestPending) clearFailure();
    try { return await originalSend.apply(this, args); }
    finally {
      const last = stream.querySelector(':scope > .message:last-of-type');
      const message = last?.querySelector('.bubble')?.textContent?.trim() || '';
      // App's catch restores the draft but historically leaves a *non-stored*
      // error as an assistant message; that breaks every aligned renderer.
      if (last?.classList.contains('assistant') && !priorNodes.has(last) && failureMessage(message)
          && !Chat.messages.some(item => item.role === 'assistant' && String(item.content || '').trim() === message)) {
        last.remove();
        showFailure(message);
        window.BAOSceneHTML?.refresh?.();
        window.BAOSceneChat?.paint?.();
      } else if (Chat.messages.length > priorCount && Chat.messages.at(-1)?.role === 'assistant') {
        clearFailure();
      }
    }
  };

  const floating = document.createElement('nav');
  floating.id = 'bao-chat-floating-actions';
  floating.setAttribute('aria-label', '故事快捷操作');
  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.textContent = '↑ 置頂';
  toTop.setAttribute('aria-label', '跳至目前故事開頭');
  toTop.addEventListener('click', () => {
    if (window.BAOStoryIntegrity?.scrollToStart) return BAOStoryIntegrity.scrollToStart();
    stream.scrollTop = 0;
    const topbar = document.querySelector('.topbar');
    const offset = topbar?.getBoundingClientRect().height || 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + stream.getBoundingClientRect().top - offset - 8), behavior: 'smooth' });
  });
  const support = document.createElement('a');
  support.href = document.querySelector('.topbar a[href*="ko-fi.com"]')?.href || 'https://ko-fi.com/roger2486';
  support.target = '_blank';
  support.rel = 'noopener noreferrer';
  support.innerHTML = '<img src="assets/bao-mark.svg" alt="">投餵肉包';
  floating.append(toTop, support);
  chat.append(floating);

  const toolbar = $('bao-chat-api-toolbar') || chat.querySelector('.chat-main');
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.id = 'bao-chat-cost-open';
  settingsButton.className = 'secondary';
  settingsButton.textContent = '⚙ 記憶／Token／成本';
  settingsButton.addEventListener('click', openSettings);
  if (toolbar?.id === 'bao-chat-api-toolbar') toolbar.append(settingsButton);
  else chat.querySelector('.chat-main')?.insertBefore(settingsButton, stream);

  const numeric = (form, name, min, max = Infinity) => {
    const value = Number(form.elements.namedItem(name)?.value);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} 必須介於 ${min} 與 ${max === Infinity ? '合理範圍' : max} 之間。`);
    return value;
  };
  const field = (name, label, value, options = {}) => {
    const attrs = [`name="${name}"`, `value="${esc(value)}"`, `type="number"`, `min="${options.min ?? 0}"`, `step="${options.step ?? 1}"`];
    if (Number.isFinite(options.max)) attrs.push(`max="${options.max}"`);
    return `<label>${label}<input ${attrs.join(' ')} required></label>`;
  };
  function openSettings() {
    if (!App.activeCharacter || !window.GameState?.current) return;
    $('bao-chat-cost-backdrop')?.remove();
    const memory = App.config.memory || {};
    const cost = App.config.cost || {};
    const modal = document.createElement('div');
    modal.id = 'bao-chat-cost-backdrop';
    const previousFocus = document.activeElement;
    modal.innerHTML = `<section id="bao-chat-cost-dialog" role="dialog" aria-modal="true" aria-labelledby="bao-chat-cost-title">
      <header><h2 id="bao-chat-cost-title">目前故事：記憶、Token 與成本</h2><button type="button" class="secondary" data-close aria-label="關閉">×</button></header>
      <p>延續第五步驟的進階設定。修改只套用到目前故事，不清空聊天或重設 API Key。單價需依你使用的服務商自行填寫。</p>
      <form id="bao-chat-cost-form">
        <fieldset><legend>記憶與 Context</legend>
          <label>記憶模式<select name="mode"><option value="smart">智慧整理</option><option value="rounds">固定輪數</option><option value="full">完整對話</option></select></label>
          ${field('maxRounds','最近保留輪數',memory.maxRounds ?? 20,{min:4,max:10000})}
          ${field('maxContext','Context 輸入預算',memory.maxContext ?? 32000,{min:1000,max:2000000})}
          ${field('summaryInterval','累積待整理輪數',memory.summaryInterval ?? 4,{min:2,max:10000})}
          <label>支援的快取提示<select name="cache"><option value="yes">使用</option><option value="no">不使用</option></select></label>
        </fieldset>
        <fieldset><legend>Token 與費用估算</legend>
          ${field('maxOutputTokens','單次最大輸出 Token',cost.maxOutputTokens ?? App.config.api?.maxOutputTokens ?? 4096,{min:64,max:32768,step:64})}
          ${field('stateInterval','世界狀態整理間隔（輪）',cost.stateInterval ?? 2,{min:1,max:20})}
          ${field('inputPerMillion','輸入單價（USD / 1M tokens）',cost.inputPerMillion ?? 0,{min:0,step:0.01})}
          ${field('outputPerMillion','輸出單價（USD / 1M tokens）',cost.outputPerMillion ?? 0,{min:0,step:0.01})}
          ${field('cachePerMillion','Cache 單價（USD / 1M tokens）',cost.cachePerMillion ?? 0,{min:0,step:0.01})}
          ${field('usdTwd','USD → TWD 換算',cost.usdTwd ?? 32,{min:0.01,step:0.01})}
          ${field('budgetTwd','本次故事預算上限（NT$；0＝不限）',cost.budgetTwd ?? 0,{min:0,step:1})}
        </fieldset>
        <p id="bao-chat-cost-error" role="alert"></p>
        <footer><button type="button" class="secondary" data-close>取消</button><button type="submit" class="primary">儲存到目前故事</button></footer>
      </form>
    </section>`;
    document.body.append(modal);
    const form = $('bao-chat-cost-form');
    form.elements.namedItem('mode').value = ['smart','rounds','full'].includes(memory.mode) ? memory.mode : 'smart';
    form.elements.namedItem('cache').value = memory.cache === false ? 'no' : 'yes';
    const close = () => { modal.remove(); previousFocus?.focus?.(); };
    modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const nextMemory = { ...memory, mode: form.elements.namedItem('mode').value, strength: 'custom',
          maxRounds: numeric(form,'maxRounds',4,10000), maxContext: numeric(form,'maxContext',1000,2000000),
          summaryInterval: numeric(form,'summaryInterval',2,10000), cache: form.elements.namedItem('cache').value === 'yes' };
        const nextCost = { ...cost, maxOutputTokens: numeric(form,'maxOutputTokens',64,32768),
          stateInterval: numeric(form,'stateInterval',1,20), inputPerMillion: numeric(form,'inputPerMillion',0),
          outputPerMillion: numeric(form,'outputPerMillion',0), cachePerMillion: numeric(form,'cachePerMillion',0),
          usdTwd: numeric(form,'usdTwd',0.01), budgetTwd: numeric(form,'budgetTwd',0) };
        App.config.memory = nextMemory;
        App.config.cost = nextCost;
        App.config.api = { ...App.config.api, maxOutputTokens: nextCost.maxOutputTokens, cacheEnabled: nextMemory.cache };
        GameState.current.config = App.config;
        Chat.protectedRounds?.(App.config);
        Chat.renderUsage?.({});
        App.saveStory?.(false);
        close();
      } catch (error) { $('bao-chat-cost-error').textContent = error.message || '設定無效。'; }
    });
    form.elements.namedItem('maxOutputTokens').focus();
  }
  window.BAOChatExperienceRepairs = { openSettings, clearFailure, failureMessage };
})();