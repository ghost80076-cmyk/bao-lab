(() => {
  'use strict';
  if (typeof App === 'undefined') return;
  const CARD_ID = 'host-club-simulator';
  const hostOrder = ['ren','haru','rei','sena','kyo','nagi'];
  const hostMeta = {
    ren:{name:'REN',role:'Top 3 · 精準營業',tag:'真心最難辨認'},
    haru:{name:'HARU',role:'新人 · 上升期',tag:'還沒學會完全隱藏自己'},
    rei:{name:'REI',role:'高單價 · 冷淡型',tag:'不黏人，也不便宜'},
    sena:{name:'SENA',role:'年下 · 高頻訊息',tag:'依賴與營業容易互相污染'},
    kyo:{name:'KYO',role:'成熟 · 傾聽型',tag:'不逼單，但看得懂你'},
    nagi:{name:'NAGI',role:'散漫 · 不可預測',tag:'越不像牛郎，越讓人想追'}
  };
  const pos = {
    ren:'0% 0%', haru:'50% 0%', rei:'100% 0%',
    sena:'0% 100%', kyo:'50% 100%', nagi:'100% 100%'
  };
  const esc = value => App.escapeHTML(String(value ?? ''));
  const avatar = () => App.activeCharacter?.avatar || 'assets/hostsim-cast.jpg';
  const bgStyle = key => `background-image:url("${App.escapeAttr(avatar())}");background-size:300% 200%;background-position:${pos[key]};`;
  const isHostSim = () => App.activeCharacter?.id === CARD_ID;
  const economyProfiles = {
    tight:{money:140000,income:240000,housing:'租屋，固定支出壓力偏高'},
    normal:{money:350000,income:320000,housing:'一般租屋／生活支出'},
    comfortable:{money:900000,income:550000,housing:'居住與現金流較寬裕'},
    wealthy:{money:2500000,income:1000000,housing:'高收入／資產充足'}
  };
  const roleProfiles = {
    customer:{label:'顧客',job:'一般上班族',charm:50,conversation:50,mood:55,health:92},
    host:{label:'新人牛郎',job:'CLUB LUMIÈRE 新人牛郎',charm:58,conversation:56,mood:58,health:93},
    nightlife:{label:'夜場／服務業從業者',job:'夜場／服務業從業者',charm:55,conversation:58,mood:54,health:90},
    custom:{label:'自訂',job:'依 Persona',charm:50,conversation:50,mood:55,health:92}
  };

  const applyInitialState = () => {
    if (!isHostSim() || !GameState.current || !App.config?.hostsimSetup) return false;
    const state = GameState.current;
    if (state.hostsimInitializedVersion >= 2) return true;
    const fresh = (Chat.messages || []).length <= 1 && (!Chat.messages.length || Chat.messages[0]?.greeting);
    if (!fresh) {
      state.hostsimInitializedVersion = 2; // Never reset an existing story's money or relationships.
      return true;
    }
    const modules = state.modules;
    if (!modules?.player_stats || !modules?.work_life || !modules?.nightlife || !modules?.host_relation) return false;
    const setup = App.config.hostsimSetup;
    const economy = economyProfiles[setup.economy] || economyProfiles.normal;
    const role = roleProfiles[setup.role] || roleProfiles.customer;
    modules.player_stats = {
      ...modules.player_stats,
      condition:'正常',
      money:economy.money,
      charm:role.charm,
      conversation:role.conversation,
      mood:role.mood,
      health:role.health
    };
    modules.work_life = {
      ...modules.work_life,
      job:App.config?.persona?.identity || role.job,
      monthly_income:economy.income,
      work_state:'正常',
      housing:economy.housing
    };
    modules.nightlife = { ...modules.nightlife, monthly_spend:0, debt:0, visits:0, emptiness:15 };
    modules.host_relation = { ...modules.host_relation, host:'暫無', stage:'初回前' };
    state.hostsimInitializedVersion = 2;
    return true;
  };

  const ensureInitialState = (attempt = 0) => {
    if (applyInitialState()) return;
    if (attempt >= 30 || !isHostSim() || !GameState.current) return;
    setTimeout(() => {
      if (applyInitialState()) {
        const active = document.querySelector('.ui-tab.active')?.dataset.panel || 'status';
        if (App.config?.displayMode === 'ui') App.renderUIPanel(active);
        App.saveStory?.(false);
      } else ensureInitialState(attempt + 1);
    }, 50);
  };

  const parseChoices = raw => {
    const found = new Map();
    String(raw || '').split(/\r?\n/).slice(-16).forEach(line => {
      const match = line.trim().match(/^(?:\*\*)?([A-D])(?:\.\*\*|\*\*\.|[.、：:])\s*(.+?)\s*$/i);
      if (!match) return;
      const key = match[1].toUpperCase();
      const text = match[2].replace(/\*\*$/,'').trim();
      if (text) found.set(key,text);
    });
    return ['A','B','C','D'].map(key => ({key,text:found.get(key)||''})).filter(item => item.text);
  };

  const mountTurnChoices = () => {
    document.getElementById('hostsim-turn-choices')?.remove();
    if (!isHostSim() || !document.getElementById('chat-view')?.classList.contains('active')) return;
    const last = [...(Chat.messages || [])].reverse().find(message => message?.role === 'assistant' && !message?.greeting);
    const choices = parseChoices(last?.content || '');
    if (choices.filter(item => item.key !== 'D').length < 2) return;
    const composer = document.querySelector('#chat-view .composer');
    if (!composer) return;
    const wrap = document.createElement('div');
    wrap.id = 'hostsim-turn-choices';
    wrap.className = 'hostsim-turn-choices';
    wrap.innerHTML = choices.map(item => `<button type="button" data-hostsim-choice="${esc(item.key)}"><span>${esc(item.key)}</span>${esc(item.text)}</button>`).join('');
    wrap.addEventListener('click', event => {
      const button = event.target.closest?.('[data-hostsim-choice]');
      if (!button) return;
      const input = document.getElementById('user-input');
      if (!input) return;
      const item = choices.find(choice => choice.key === button.dataset.hostsimChoice);
      if (!item) return;
      input.value = item.key === 'D' ? '' : item.text;
      input.focus();
      input.setSelectionRange?.(input.value.length,input.value.length);
    });
    composer.before(wrap);
  };

  const originalRenderDetail = App.renderDetail.bind(App);
  App.renderDetail = function() {
    if (this.activeCharacter?.id !== CARD_ID) return originalRenderDetail();
    const c = this.activeCharacter;
    ['detail','builder','chat'].forEach(v => document.getElementById(v+'-view')?.setAttribute('data-category-theme','r18'));
    const cast = Array.isArray(c.profile?.cast) ? c.profile.cast : [];
    document.getElementById('character-detail').innerHTML = `
      <section class="hostsim-detail">
        <button class="back-link hostsim-back" type="button">← 返回作品區</button>
        <div class="hostsim-hero">
          <div class="hostsim-hero-visual">
            <div class="hostsim-hero-portrait" style="${bgStyle('ren')}"></div>
            <div class="hostsim-hero-copy">
              <span class="hostsim-kicker">KABUKICHO / CLUB LUMIÈRE</span>
              <h1>${esc(c.title || c.name)}</h1>
              <p>${esc(c.description || '')}</p>
              <blockquote>${esc(c.quote || '')}</blockquote>
              <div class="tags">${(c.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>
              <div class="hostsim-actions">
                <button class="primary" data-hostsim-start>開始遊戲</button>
                <span>18+ · 世界模擬 · 經濟循環 · 多結局</span>
              </div>
            </div>
          </div>
          <aside class="hostsim-rules">
            <b>這不是戀愛保證書。</b>
            <p>店內的甜，是工作的一部分；店外的冷，也不一定代表沒有真心。</p>
            <div><span>重要度</span><small>你對他職業與業績的價值</small></div>
            <div><span>好感度</span><small>他私下對你的真實看法</small></div>
            <div><span>金錢</span><small>每次靠近都可能留下帳單</small></div>
          </aside>
        </div>
        <div class="hostsim-section-head">
          <div><span class="hostsim-kicker">HOST LINEUP</span><h2>今晚，誰坐到你旁邊？</h2></div>
          <p>公開資料只是店家人設。真正的性格要在故事裡慢慢看見。</p>
        </div>
        <div class="hostsim-cast-grid">
          ${hostOrder.map(key => {
            const info = hostMeta[key];
            const profile = cast.find(x => x.id === key);
            return `<article class="hostsim-card">
              <div class="hostsim-card-photo" style="${bgStyle(key)}"></div>
              <div class="hostsim-card-body">
                <span>${esc(profile?.role || info.role)}</span>
                <h3>${esc(profile?.name || info.name)}</h3>
                <p>${esc(profile?.hook || info.tag)}</p>
              </div>
            </article>`;
          }).join('')}
        </div>
        <div class="hostsim-feature-grid">
          <article><b>白天不是空白</b><span>工作、排班、房租、薪水與疲勞都會推進。</span></article>
          <article><b>店內不等於真心</b><span>初回、指名、延長、酒水、排名各有代價。</span></article>
          <article><b>店外才是另一條線</b><span>after、吃飯、約會與更私人接觸需要時間與條件。</span></article>
          <article><b>你可以離開</b><span>祛魅、換担当、跨店、停消費，都是有效玩法。</span></article>
        </div>
      </section>`;
    document.querySelector('.hostsim-back')?.addEventListener('click',()=>this.showView('explore'));
    document.querySelector('[data-hostsim-start]')?.addEventListener('click',()=>this.openBuilder());
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function() {
    originalOpenBuilder();
    if (this.activeCharacter?.id !== CARD_ID) return;
    const panel = document.querySelector('.builder-step[data-step-panel="3"]');
    if (!panel || panel.querySelector('#hostsim-player-setup')) return;
    const box = document.createElement('section');
    box.id = 'hostsim-player-setup';
    box.className = 'hostsim-builder-box';
    box.innerHTML = `
      <div class="hostsim-builder-title"><span>HOST CLUB SIMULATOR</span><b>玩家開局補充</b></div>
      <div class="form-grid">
        <label>年齡（18+）<input id="hostsim-age" type="number" min="18" max="99" value="24"></label>
        <label>開局身分
          <select id="hostsim-role">
            <option value="customer">顧客（預設）</option>
            <option value="host">新人牛郎</option>
            <option value="nightlife">夜場／服務業從業者</option>
            <option value="custom">自訂</option>
          </select>
        </label>
        <label>經濟狀況
          <select id="hostsim-money">
            <option value="tight">吃得下日常，但不適合高額消費</option>
            <option value="normal" selected>普通上班族程度</option>
            <option value="comfortable">收入／存款較寬裕</option>
            <option value="wealthy">高收入或資產充足</option>
          </select>
        </label>
        <label>第一次來的理由<input id="hostsim-reason" maxlength="160" placeholder="朋友帶來、失戀、好奇、工作應酬…"></label>
      </div>
      <label>現實生活補充<textarea id="hostsim-life" maxlength="500" rows="3" placeholder="工作、房租、債務、作息、不能出現的內容…"></textarea></label>
      <p class="note">這些資料只用來建立本次故事開局。初始金錢與生活壓力會依你的 Persona 和這裡的設定調整。</p>`;
    panel.appendChild(box);
  };

  const originalCollectConfig = App.collectConfig.bind(App);
  App.collectConfig = function() {
    const cfg = originalCollectConfig();
    if (this.activeCharacter?.id === CARD_ID) {
      cfg.hostsimSetup = {
        age:Number(document.getElementById('hostsim-age')?.value || 24),
        role:document.getElementById('hostsim-role')?.value || 'customer',
        economy:document.getElementById('hostsim-money')?.value || 'normal',
        reason:(document.getElementById('hostsim-reason')?.value || '').trim(),
        life:(document.getElementById('hostsim-life')?.value || '').trim()
      };
      if (cfg.hostsimSetup.age < 18) cfg.hostsimSetup.age = 18;
      const role = roleProfiles[cfg.hostsimSetup.role] || roleProfiles.customer;
      if (!cfg.persona.identity) cfg.persona.identity = role.job;
      const setupNote = [
        `牛郎模擬器開局：${cfg.hostsimSetup.age} 歲（成年）／${role.label}`,
        cfg.hostsimSetup.reason ? `來店理由：${cfg.hostsimSetup.reason}` : '',
        cfg.hostsimSetup.life ? `生活補充：${cfg.hostsimSetup.life}` : ''
      ].filter(Boolean).join('；');
      cfg.persona.extra = [cfg.persona.extra,setupNote].filter(Boolean).join('\n');
      cfg.narrativeMode = 'world';
      cfg.displayMode = 'ui';
    }
    return cfg;
  };

  const meter = (label,value,max=100) => {
    const n = Math.max(0,Math.min(max,Number(value)||0));
    const pct = max ? Math.max(0,Math.min(100,n/max*100)) : 0;
    return `<div class="hostsim-meter"><div><span>${esc(label)}</span><b>${esc(n)}</b></div><i><em style="width:${pct}%"></em></i></div>`;
  };
  const money = value => {
    const n = Number(value);
    return Number.isFinite(n) ? '¥' + Math.max(0,Math.round(n)).toLocaleString('ja-JP') : '—';
  };

  const originalRenderUIPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    if (this.activeCharacter?.id !== CARD_ID || !GameState.current) return originalRenderUIPanel(panel);
    const ui = document.getElementById('ui-panel');
    if (!ui) return;
    const s = GameState.current;
    const fallback = this.activeCharacter?.initial_state?.modules || {};
    const modules = s.modules || fallback;
    if (panel === 'status') {
      const p = modules.player_stats || fallback.player_stats || {};
      const r = modules.host_relation || fallback.host_relation || {};
      const n = modules.nightlife || fallback.nightlife || {};
      const w = modules.work_life || fallback.work_life || {};
      const hostName = String(r.host || '暫無').toUpperCase();
      const hostStatus = hostName !== '暫無' ? (s.characterStatuses?.[hostName] || {}) : {};
      const relationValue = key => hostStatus[key] ?? r[key] ?? 0; // old saves can still read legacy module values.
      ui.innerHTML = `
        <div class="hostsim-status-shell">
          <section class="hostsim-status-card primary">
            <div class="hostsim-status-title"><span>PLAYER</span><b>${esc(this.config?.persona?.name || '玩家')}</b></div>
            <div class="hostsim-money-row"><small>目前金錢</small><strong>${money(p.money)}</strong></div>
            <div class="hostsim-stat-grid">
              ${meter('魅力',p.charm)}${meter('談吐',p.conversation)}${meter('心情',p.mood)}${meter('健康',p.health)}
            </div>
            <p>狀態：${esc(p.condition || '正常')} · ${esc(w.job || '現實生活未初始化')}</p>
          </section>
          <section class="hostsim-status-card relation">
            <div class="hostsim-status-title"><span>${this.config?.hostsimSetup?.role === 'host' ? '焦點關係' : '担当關係'}</span><b>${esc(r.host || '暫無')}</b></div>
            ${meter('重要度',relationValue('importance'))}${meter('好感度',relationValue('affection'))}${meter('依賴度',relationValue('dependency'))}${meter('警戒度',relationValue('guard'))}
            <p>階段：${esc(hostStatus.stage || r.stage || '初回前')}${hostName !== '暫無' ? ` · 接待／指名 ${esc(hostStatus.visits ?? 0)} 次 · 歸屬消費 ${money(hostStatus.spend ?? 0)}` : ''}</p>
          </section>
          <section class="hostsim-status-card finance">
            <div><small>本月店內消費</small><b>${money(n.monthly_spend)}</b></div>
            <div><small>負債</small><b>${money(n.debt)}</b></div>
            <div><small>來店次數</small><b>${esc(n.visits ?? 0)}</b></div>
            <div><small>店外空虛</small><b>${esc(n.emptiness ?? 0)} / 100</b></div>
          </section>
        </div>`;
      return;
    }
    if (panel === 'npc') {
      const byName = new Map((s.npcs||[]).map(n=>[String(n.name||'').toUpperCase(),n]));
      ui.innerHTML = `<div class="hostsim-npc-grid">${hostOrder.map(key=>{
        const info=hostMeta[key], state=byName.get(info.name)||{};
        const status=s.characterStatuses?.[info.name]||{};
        const relation=status.stage&&status.stage!=='未認識' ? status.stage : (state.relationship||'未認識');
        return `<article><div class="hostsim-mini-photo" style="${bgStyle(key)}"></div><div><b>${info.name}</b><span>${esc(state.role||info.role)}</span><small>${esc(state.mood||status.mood||'未知')} · ${esc(relation)}</small></div></article>`;
      }).join('')}</div>`;
      return;
    }
    return originalRenderUIPanel(panel);
  };

  const originalSendMessage = App.sendMessage.bind(App);
  App.sendMessage = async function(...args) {
    const result = await originalSendMessage(...args);
    if (isHostSim()) setTimeout(mountTurnChoices,0);
    return result;
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh=false) {
    applyInitialState();
    originalRenderChatShell(fresh);
    if (this.activeCharacter?.id !== CARD_ID) return;
    ensureInitialState();
    const card = document.getElementById('chat-character-card');
    if (card) card.innerHTML = `<div class="hostsim-chat-badge"><span>CLUB LUMIÈRE</span><b>歌舞伎町・最後指名</b></div>`;
    document.querySelector('.ui-tab[data-panel="status"]')?.click();
    setTimeout(mountTurnChoices,0);
  };

  window.BAOHostSimUI = { applyInitialState, ensureInitialState, parseChoices, mountTurnChoices };
})();
