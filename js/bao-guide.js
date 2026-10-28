/* The existing Bao mascot's guide. Only navigation preferences are persisted.
 * No model calls, credential storage, or copies of story/settings forms. */
(() => {
  'use strict';
  if (window.BAOGuide) return;
  const KEY = 'yorubay:bao-journey:v1';
  const $ = id => document.getElementById(id);
  const active = id => $(id)?.classList.contains('active');
  let host, controls, topic = 'journey';
  const preference = () => { try { return localStorage.getItem(KEY); } catch { return ''; } };
  const remember = value => { try { localStorage.setItem(KEY, value); } catch { /* optional */ } };
  const button = (action, label) => `<button type="button" data-bao-journey="${action}">${label}</button>`;
  const link = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const topics = {
    api: {
      title: '自己的模型連線，從哪裡開始？',
      body: 'API 是讓夜灣向你選的 AI 服務取得回覆的連線。費用由該服務計算；申請後，把金鑰貼到夜灣原本的連線欄位即可。先選一條你能使用的路。',
      actions: button('official', '直接向模型公司申請') + button('router', '認識 OpenRouter') + button('relay', '我有其他中轉服務') + button('setup', '我已有 Key，帶我設定')
    },
    official: {
      title: '官方 API',
      body: '直接向模型公司申請金鑰。以 Google Gemini 為例：開啟 AI Studio、依服務要求建立金鑰，再回夜灣選 Google Gemini 並貼入。可用地區、額度與價格請以官方頁面為準。',
      actions: link('https://aistudio.google.com/apikey', '開啟 Google AI Studio') + button('setup', '拿到 Key 了，回到設定')
    },
    router: {
      title: 'OpenRouter',
      body: '它是可連接多家模型的平台，並非各模型公司的官方 API。開啟服務網站、依需要設定帳號與額度、建立金鑰，再回夜灣選 OpenRouter。使用前請查看所選模型的費用及資料政策。',
      actions: link('https://openrouter.ai/keys', '開啟 OpenRouter 金鑰頁') + button('setup', '拿到 Key 了，回到設定')
    },
    relay: {
      title: '其他服務／第三方中轉',
      body: '有些中轉價格較低，但品質、穩定性與資料處理方式不一，夜灣未逐一驗證。請先確認服務來源與規則；只有服務要求自訂連線時，才在進階欄位填入它提供的網址、協定與模型代號。',
      actions: button('setup', '前往原本的連線設定')
    },
    models: {
      title: '找不到模型，先看這幾件事',
      body: '先確認選到金鑰所屬的服務。接著展開「找不到模型？」並從帳號取得清單；清單失敗時，確認金鑰有效、帳號權限與服務網址。清單沒有想用的模型，可在進階欄位填服務商提供的精確模型代號。',
      actions: button('find-model', '帶我找模型') + link('api-guide.html', '需要時查看完整連線說明')
    },
    error: {
      title: '連線遇到問題',
      body: '金鑰／權限錯誤：確認服務與金鑰相符，並檢查帳號權限。模型不存在：核對模型代號與開放權限。額度或頻率限制：查看服務帳號額度，稍後重試。網路錯誤：確認網址與服務狀態。不需要把金鑰貼給包包。',
      actions: button('auth', '金鑰或權限錯誤') + button('models', '模型／端點不存在') + button('quota', '額度不足／請求太頻繁') + button('network', '網路／服務異常')
    },
    auth: {
      title: '金鑰／權限錯誤（401、403）',
      body: '先確認選到這把 Key 所屬的服務，重新貼上完整金鑰。若仍沒有權限，請到該服務查看帳號、地區與模型使用權限。更換金鑰後再測試；不要把金鑰貼到聊天或截圖中。',
      actions: button('setup', '帶我回連線設定')
    },
    quota: {
      title: '額度或頻率限制（429）',
      body: '查看服務帳號是否有可用額度；若是短時間請求過多，請稍候再試。使用夜灣燈火時，請查看夜灣帳號額度。重複按送出通常無法解決限制。',
      actions: link('account.html', '查看夜灣帳號') + button('setup', '查看使用中的連線')
    },
    network: {
      title: '網路／服務異常',
      body: '先確認網路與連線網址。若服務回傳 5xx，可能需等待服務恢復；若提示 CORS，請確認服務是否允許從瀏覽器連線。本機模型則先確認 LM Studio Server 已啟動。',
      actions: button('setup', '帶我回連線設定')
    },
    backup: {
      title: '保留你的故事',
      body: '快速儲存會保留目前進度。重要故事也請從控制中心的存檔工具匯出備份，避免瀏覽器資料清除後遺失。',
      actions: button('control', '打開控制中心')
    },
    memory: {
      title: '故事記憶',
      // Reuse the existing help source rather than maintaining another explanation.
      get body() { return window.BAOFeatureHelp?.TOPICS.memory.body || '在控制中心查看故事記憶與整理結果。'; },
      actions: button('memory-open', '打開記憶工作台')
    }
  };
  const render = () => {
    if (!host) return;
    const inStory = active('chat-view');
    const selected = Boolean(window.App?.activeCharacter);
    const inBuilder = active('builder-view');
    // The existing evaluator returns completion flags, never credentials.
    const ready = inBuilder ? window.BAOStoryStartReadiness?.snapshot?.() : null;
    if (inStory && preference() !== 'skipped') remember('completed');
    let title, body, actions;
    if (topic !== 'journey' && topics[topic]) {
      ({title, body, actions} = topics[topic]);
      actions += button('journey', '返回目前進度');
    } else if (inStory) {
      title = '故事已開啟，想了解哪一項？';
      body = '模型、玩家身份與記憶都能從控制中心調整。開始故事只代表必要設定已填妥，實際連線狀況以測試或送出後的結果為準。';
      actions = button('setup', '查看模型連線') + button('memory', '記憶怎麼用') + button('backup', '儲存與備份') + button('error', '連線遇到問題');
    } else if (preference() === 'skipped') {
      title = '需要時，我在這裡';
      body = '你可以自由探索，也能隨時重新開始帶路。';
      actions = button('resume', '重新讓包包帶路') + button('api', '了解 API') + button('models', '找不到模型');
    } else if (!selected && preference() === 'completed') {
      title = '歡迎回來，今天想從哪裡開始？';
      body = '你可以選新的作品，也可以隨時查看連線與功能協助。';
      actions = button('explore', '選一個故事') + button('api', '模型連線協助') + button('backup', '儲存與備份');
    } else if (!selected) {
      title = '1 / 3 · 先找一個想玩的故事';
      body = '不用先看完說明。挑選喜歡的作品，打開介紹，再按開始故事；我會在設定畫面接著陪你。';
      actions = button('explore', '帶我選作品') + button('skip', '我先自己逛逛');
    } else if (!inBuilder) {
      title = '2 / 3 · 選好作品，再決定怎麼連線';
      body = '開始設定後，可以選夜灣燈火或自己的模型連線。不熟悉 API 也沒關係。';
      actions = button('setup', '帶我繼續設定') + button('api', '我還不懂 API');
    } else {
      title = ready?.canStart ? '3 / 3 · 必要設定已填妥' : '2 / 3 · 準備故事的模型連線';
      body = ready?.canStart ? '可以回到設定畫面開始故事。這是欄位檢查，尚不代表實際連線成功；也可以先測試連線（可能計費）。' : '包包會直接帶你操作目前的設定。' + (ready?.ai?.label || '先選夜灣燈火，或使用自己的模型連線。');
      actions = button('setup', ready?.canStart ? '回到設定，開始故事' : '繼續目前設定') + button('api', '我還沒有 API Key') + button('models', '找不到模型') + button('error', '連線遇到問題');
    }
    host.innerHTML = `<h3></h3><p></p><div class="bao-guide-actions">${actions}</div><details><summary>包包的工具包</summary><div class="bao-guide-actions">${button('api','API 入門')}${button('models','找不到模型')}${button('backup','儲存與備份')}${button('memory','故事記憶')}${link('quick-start.html','三步開始文件')}${link('api-guide.html','完整連線文件')}${link('lm-studio-guide.html','本機模型文件')}</div></details>`;
    host.querySelector('h3').textContent = title;
    host.querySelector('p').textContent = body;
  };
  const show = value => { topic = topics[value] ? value : 'journey'; render(); };
  const setup = () => {
    if (active('chat-view')) { controls.close(); window.BAOChatAPISettings?.open?.(); return; }
    if (!window.App?.activeCharacter) { controls.close(); remember('active'); if (window.App) App.showView?.('explore'); else location.href = 'index.html#explore'; return; }
    controls.close();
    if (!active('builder-view')) window.App?.openBuilder?.();
    window.BAOGuidedOnboarding?.reopen?.();
    $('bao-guided-setup')?.scrollIntoView({block:'center'});
    $('bao-guided-setup')?.focus();
  };
  const mount = (node, options) => {
    host = node; controls = options;
    host.addEventListener('click', event => {
      const action = event.target.closest('[data-bao-journey]')?.dataset.baoJourney;
      if (!action) return;
      if (action === 'skip') { remember('skipped'); window.BAOGuidedOnboarding?.render?.(); controls.close(); }
      else if (action === 'resume') { remember('active'); window.BAOGuidedOnboarding?.reopen?.(); show('journey'); }
      else if (action === 'explore') { remember('active'); controls.close(); if (window.App) App.showView?.('explore'); else location.href = 'index.html#explore'; }
      else if (action === 'setup') setup();
      else if (action === 'control' || action === 'memory-open') {
        if (!active('chat-view')) { show('journey'); return; }
        controls.close();
        if (action === 'control') window.BAOStoryControlCenter?.open?.();
        else window.BAOMemoryWorkbench?.open?.();
      } else if (action === 'find-model') {
        setup();
        const disclosure = $('bao-builder-model-discovery-more');
        if (active('builder-view') && disclosure) {
          const toggle = $('bao-quick-technical-toggle');
          if (toggle && toggle.getAttribute('aria-expanded') !== 'true' && !toggle.hidden) toggle.click();
          disclosure.open = true; disclosure.scrollIntoView({block:'center'}); disclosure.querySelector('button')?.focus(); }
      } else show(action);
    });
    render();
  };
  window.BAOGuide = Object.freeze({ mount, render, show });
})();
