(() => {
  'use strict';
  if (typeof App === 'undefined') return;
  const CARD_ID='night-sky-magic-academy';
  const esc=value=>App.escapeHTML(String(value??''));
  const isMagic=()=>App.activeCharacter?.id===CARD_ID;
  const cover=()=>App.activeCharacter?.avatar||'assets/night-sky-academy-cover-v2.webp';
  const mysterySeeds=[
    '禁書庫有一本只在深夜自行翻頁的無名書',
    '一幅封存舊畫似乎認得玩家的姓氏',
    '學院地下存在一間不在任何地圖上的教室',
    '有學生會週期性失去完整一天的記憶',
    '一隻不明神奇生物反覆出現在特定學生夢中',
    '創校時期的一件星環遺物正在重新甦醒',
    '有人秘密收集學生施法後殘留的魔力痕跡'
  ];
  const hash=text=>[...String(text)].reduce((n,ch)=>(n*31+ch.charCodeAt(0))>>>0,2166136261);
  const seedFor=setup=>mysterySeeds[hash(JSON.stringify(setup))%mysterySeeds.length];
  const aptitudeKey={
    charms:'charms',potions:'potions',herbology:'herbology',transfiguration:'transfiguration',
    defense:'defense',creatures:'creatures',divination:'divination',flight:'flight',runes:'runes'
  };

  const parseChoices=raw=>{
    const map=new Map();
    String(raw||'').split(/\r?\n/).slice(-18).forEach(line=>{
      const m=line.trim().match(/^(?:\*\*)?([1-5])(?:\.\*\*|\*\*\.|[.、：:])\s*(.+?)\s*$/);
      if(m) map.set(m[1],m[2].replace(/\*\*$/,'').trim());
    });
    return ['1','2','3','4','5'].map(key=>({key,text:map.get(key)||''})).filter(x=>x.text);
  };
  const mountChoices=()=>{
    document.getElementById('magic-academy-turn-choices')?.remove();
    if(!isMagic()||!document.getElementById('chat-view')?.classList.contains('active')) return;
    const last=[...(Chat.messages||[])].reverse().find(m=>m?.role==='assistant'&&!m?.greeting);
    const choices=parseChoices(last?.content||'');
    if(choices.filter(x=>x.key!=='5').length<2) return;
    const composer=document.querySelector('#chat-view .composer');
    if(!composer) return;
    const wrap=document.createElement('div');
    wrap.id='magic-academy-turn-choices';
    wrap.className='magic-academy-turn-choices';
    wrap.innerHTML=choices.map(x=>`<button type="button" data-magic-choice="${x.key}"><span>${x.key}</span>${esc(x.text)}</button>`).join('');
    wrap.addEventListener('click',event=>{
      const btn=event.target.closest?.('[data-magic-choice]');
      if(!btn) return;
      const input=document.getElementById('user-input');
      const choice=choices.find(x=>x.key===btn.dataset.magicChoice);
      if(!input||!choice) return;
      input.value=choice.key==='5'?'':choice.text;
      input.focus();
      input.setSelectionRange?.(input.value.length,input.value.length);
    });
    composer.before(wrap);
  };

  const meter=(label,value,max=100)=>{
    const n=Math.max(0,Math.min(max,Number(value)||0));
    return `<div class="magic-meter"><div><span>${esc(label)}</span><b>${n}</b></div><i><em style="width:${max?n/max*100:0}%"></em></i></div>`;
  };

  const originalRenderDetail=App.renderDetail.bind(App);
  App.renderDetail=function(){
    if(!isMagic()) return originalRenderDetail();
    const c=this.activeCharacter;
    ['detail','builder','chat'].forEach(v=>document.getElementById(v+'-view')?.setAttribute('data-category-theme','male'));
    document.getElementById('character-detail').innerHTML=`
      <section class="magic-detail">
        <button class="back-link magic-back" type="button">← 返回作品區</button>
        <div class="magic-hero">
          <div class="magic-hero-art"><img src="${App.escapeAttr(cover())}" alt="夜穹魔法學院的月夜校園" decoding="async"></div>
          <div class="magic-hero-copy">
            <span class="magic-kicker">NIGHT SKY MAGIC ACADEMY / FIRST YEAR</span>
            <h1>${esc(c.title||c.name)}</h1>
            <p>${esc(c.description||'')}</p>
            <blockquote>${esc(c.quote||'')}</blockquote>
            <div class="tags">${(c.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>
            <div class="magic-actions"><button class="primary" data-magic-start>收到錄取通知</button><span>分院 · 課程 · NPC 群像 · 隱藏主線</span></div>
          </div>
        </div>
        <div class="magic-section-head"><div><span class="magic-kicker">FOUR HOUSES</span><h2>你會成為哪一院的人？</h2></div><p>學院不是人格測驗結果，而是你願意長期成為什麼樣的人。</p></div>
        <div class="magic-house-grid">
          <article class="crimson"><b>赤曜院</b><span>行動 · 勇氣 · 責任</span><p>敢於行動，也敢於承擔。</p></article>
          <article class="thorn"><b>霧棘院</b><span>野心 · 策略 · 自我塑造</span><p>先看清局勢，再決定代價。</p></article>
          <article class="tide"><b>星潮院</b><span>求知 · 理性 · 創造</span><p>未知只是尚未被理解。</p></article>
          <article class="moss"><b>苔庭院</b><span>忠誠 · 耐心 · 群體</span><p>長久的力量來自留下。</p></article>
        </div>
        <div class="magic-feature-grid">
          <article><b>第一學年真的會前進</b><span>課表、作業、考試、社團、學院分與處分會留下後果。</span></article>
          <article><b>魔法不是開局全會</b><span>技能靠課程、練習與事件逐步解鎖與熟練。</span></article>
          <article><b>NPC 不圍著你轉</b><span>每個人都有自己的課程、朋友、秘密與競爭。</span></article>
          <article><b>秘密在開局就固定</b><span>DM 知道真相，但玩家只能從已知線索慢慢逼近。</span></article>
        </div>
      </section>`;
    document.querySelector('.magic-back')?.addEventListener('click',()=>this.showView('explore'));
    document.querySelector('[data-magic-start]')?.addEventListener('click',()=>this.openBuilder());
  };

  const renderConfirm=()=>{
    const root=document.getElementById('magic-academy-confirm');
    if(!root) return;
    const get=id=>document.getElementById(id)?.value||'隨機';
    root.innerHTML=`<b>入學資料確認</b><p>${esc(get('magic-origin'))} · ${esc(get('magic-personality'))} · 擅長 ${esc(get('magic-aptitude'))} · 學院偏好 ${esc(get('magic-house'))}</p><small>NPC：${esc(get('magic-npc-mode'))}${get('magic-npc-text')&&get('magic-npc-text')!=='隨機'? ' / '+esc(get('magic-npc-text')):''}。按下「確認入學・開始第一學年」後才正式建立故事。</small>`;
  };

  const originalOpenBuilder=App.openBuilder.bind(App);
  App.openBuilder=function(){
    originalOpenBuilder();
    if(!isMagic()) return;
    const panel=document.querySelector('.builder-step[data-step-panel="3"]');
    if(panel&&!panel.querySelector('#magic-academy-setup')){
      const box=document.createElement('section');
      box.id='magic-academy-setup';
      box.className='magic-builder-box';
      box.innerHTML=`
        <div class="magic-builder-title"><span>ENROLLMENT</span><b>入學資料</b></div>
        <div class="form-grid">
          <label>年齡<input id="magic-age" type="number" min="10" max="99" value="17"></label>
          <label>性別<input id="magic-gender" maxlength="40" placeholder="女 / 男 / 非二元 / 自訂"></label>
          <label>出身<select id="magic-origin"><option>隨機</option><option>古老魔法家族</option><option>混合魔法家庭</option><option>無魔法家庭出身</option><option>被魔法界收養</option><option>隱藏身世</option></select></label>
          <label>性格傾向<select id="magic-personality"><option>隨機</option><option>勇敢衝動</option><option>聰明冷靜</option><option>溫和善良</option><option>野心勃勃</option><option>孤僻神秘</option><option>表面普通但直覺敏銳</option></select></label>
          <label>擅長方向<select id="magic-aptitude"><option value="random">隨機</option><option value="charms">基礎術式</option><option value="potions">魔藥</option><option value="herbology">植物魔法</option><option value="transfiguration">變形</option><option value="defense">防禦</option><option value="creatures">神奇生物</option><option value="divination">占卜感知</option><option value="flight">飛行</option><option value="runes">古代魔文</option></select></label>
          <label>學院偏好<select id="magic-house"><option value="ceremony">交給分院儀式</option><option>赤曜院</option><option>霧棘院</option><option>星潮院</option><option>苔庭院</option><option>隨機</option></select></label>
          <label>隱藏主線<select id="magic-mystery"><option value="slow">慢熱開啟</option><option value="on">開啟</option><option value="random">隨機</option></select></label>
          <label>NPC 導入<select id="magic-npc-mode"><option>使用原創預設 NPC</option><option>隨機生成</option><option>自己填寫人設</option><option>輸入團體</option><option>輸入現實人物</option><option>不導入</option></select></label>
          <label>NPC 處理<select id="magic-npc-handle"><option>只保留氣質</option><option>改名</option><option>保留原名（平行世界）</option><option>隨機</option></select></label>
          <label>初始關係<select id="magic-npc-relation"><option>陌生</option><option>同級生</option><option>學長學姐</option><option>室友</option><option>朋友</option><option>競爭對手</option><option>家族舊識</option><option>隨機</option></select></label>
        </div>
        <label>想導入的 NPC / 團體 / 關鍵詞<textarea id="magic-npc-text" maxlength="600" rows="3" placeholder="例如：冷淡的霧棘院學長；或直接輸入自訂人設。"></textarea></label>
        <div id="magic-academy-confirm" class="magic-confirm"></div>`;
      panel.appendChild(box);
      box.addEventListener('input',renderConfirm);
      box.addEventListener('change',renderConfirm);
      renderConfirm();
    }
    setTimeout(()=>{const start=document.getElementById('start-story');if(start)start.textContent='確認入學・開始第一學年';},0);
  };

  const originalCollectConfig=App.collectConfig.bind(App);
  App.collectConfig=function(){
    const cfg=originalCollectConfig();
    if(!isMagic()) return cfg;
    const val=id=>document.getElementById(id)?.value||'';
    const setup={
      age:Number(val('magic-age')||17),gender:val('magic-gender')||'未指定',origin:val('magic-origin')||'隨機',
      personality:val('magic-personality')||'隨機',aptitude:val('magic-aptitude')||'random',house:val('magic-house')||'ceremony',
      mystery:val('magic-mystery')||'slow',npcMode:val('magic-npc-mode')||'使用原創預設 NPC',npcHandle:val('magic-npc-handle')||'只保留氣質',
      npcRelation:val('magic-npc-relation')||'陌生',npcText:(val('magic-npc-text')||'').trim()
    };
    setup.mysterySeed=seedFor(setup);
    cfg.magicAcademySetup=setup;
    cfg.narrativeMode='world';
    cfg.displayMode='ui';
    cfg.persona.extra=[cfg.persona.extra,`夜穹入學設定：${setup.age}歲；${setup.gender}；${setup.origin}；${setup.personality}；擅長=${setup.aptitude}；學院偏好=${setup.house}；NPC=${setup.npcMode}/${setup.npcHandle}/${setup.npcRelation}${setup.npcText?'：'+setup.npcText:''}`].filter(Boolean).join('\n');
    return cfg;
  };

  const originalBuildSystemPrompt=App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt=function(){
    const base=originalBuildSystemPrompt();
    if(!isMagic()||!this.config?.magicAcademySetup) return base;
    return base+`\n\n【DM 私有固定主線】${this.config.magicAcademySetup.mysterySeed}。只逐步透過線索揭露，不直接向玩家說明這句設定。`;
  };

  const applyInitialState=()=>{
    if(!isMagic()||!GameState.current||!App.config?.magicAcademySetup) return false;
    const state=GameState.current;
    if(state.magicAcademyInitializedVersion>=1) return true;
    const fresh=(Chat.messages||[]).length<=1&&(!Chat.messages.length||Chat.messages[0]?.greeting);
    if(!fresh){state.magicAcademyInitializedVersion=1;return true;}
    const setup=App.config.magicAcademySetup, modules=state.modules;
    if(!modules?.academy_life||!modules?.magic_skills||!modules?.mystery_state) return false;
    modules.academy_life.house='待分院';
    modules.academy_life.year=1;
    const skill=aptitudeKey[setup.aptitude];
    if(skill&&modules.magic_skills[skill]!=null) modules.magic_skills[skill]=14;
    modules.mystery_state.phase='序章';
    modules.mystery_state.active_thread='尚無明確異常';
    state.magicAcademyPrivate={mysterySeed:setup.mysterySeed};
    state.magicAcademyInitializedVersion=1;
    return true;
  };
  const ensureInitialState=(n=0)=>{
    if(applyInitialState()) return;
    if(n>=30||!isMagic()||!GameState.current) return;
    setTimeout(()=>ensureInitialState(n+1),50);
  };

  const originalRenderUIPanel=App.renderUIPanel.bind(App);
  App.renderUIPanel=function(panel){
    if(!isMagic()||!GameState.current) return originalRenderUIPanel(panel);
    const ui=document.getElementById('ui-panel');
    if(!ui) return;
    const s=GameState.current, modules=s.modules||{};
    if(panel==='status'){
      const life=modules.academy_life||{}, skills=modules.magic_skills||{}, mystery=modules.mystery_state||{}, work=modules.schoolwork||{};
      ui.innerHTML=`
        <div class="magic-status-shell">
          <section class="magic-status-card academy">
            <div class="magic-status-title"><span>ACADEMY</span><b>${esc(life.house||'待分院')}</b></div>
            <div class="magic-status-grid"><div><small>日期</small><b>${esc(life.date||'—')}</b></div><div><small>時段</small><b>${esc(life.time_slot||'—')}</b></div><div><small>地點</small><b>${esc(life.location||'—')}</b></div><div><small>學院分</small><b>${esc(life.house_points??0)}</b></div></div>
            <p>違規紀錄：${esc(life.violations??0)} · 下一堂：${esc(work.next_class||'尚未安排')}</p>
          </section>
          <section class="magic-status-card skills"><div class="magic-status-title"><span>MAGIC</span><b>熟練度</b></div>
            <div class="magic-skill-grid">${meter('術式',skills.charms)}${meter('魔藥',skills.potions)}${meter('植物',skills.herbology)}${meter('變形',skills.transfiguration)}${meter('防禦',skills.defense)}${meter('生物',skills.creatures)}${meter('占卜',skills.divination)}${meter('飛行',skills.flight)}${meter('魔文',skills.runes)}</div>
          </section>
          <section class="magic-status-card mystery"><div class="magic-status-title"><span>MYSTERY</span><b>${esc(mystery.phase||'序章')}</b></div><div class="magic-status-grid"><div><small>確認線索</small><b>${esc(mystery.clue_count??0)}</b></div><div><small>危險度</small><b>${esc(mystery.threat??0)} / 100</b></div></div><p>${esc(mystery.active_thread||'尚無明確異常')}</p></section>
        </div>`;
      return;
    }
    return originalRenderUIPanel(panel);
  };

  const originalSendMessage=App.sendMessage.bind(App);
  App.sendMessage=async function(...args){const result=await originalSendMessage(...args);if(isMagic())setTimeout(mountChoices,0);return result;};

  const originalRenderChatShell=App.renderChatShell.bind(App);
  App.renderChatShell=function(fresh=false){
    applyInitialState();
    originalRenderChatShell(fresh);
    if(!isMagic()) return;
    ensureInitialState();
    const card=document.getElementById('chat-character-card');
    if(card) card.innerHTML='<div class="magic-chat-badge"><span>NIGHT SKY MAGIC ACADEMY</span><b>第一學年</b></div>';
    document.querySelector('.ui-tab[data-panel="status"]')?.click();
    setTimeout(mountChoices,0);
  };

  window.BAONightSkyAcademy={parseChoices,mountChoices,applyInitialState,seedFor};
})();
