(() => {
  'use strict';
  if (typeof App === 'undefined') return;

  const CARD_ID='k-idol-survival-simulator';
  const esc=value=>App.escapeHTML(String(value??''));
  const isIdol=()=>App.activeCharacter?.id===CARD_ID;
  const cover=()=>App.activeCharacter?.avatar||'assets/k-idol-survival-cover.svg';
  const programs=['PROJECT: NINE','STARLINE 101','NEXT IDOL : SEOUL','STAGE BORN','ONE TAKE PROJECT'];
  const groups=['NOVA9','LUMEN','VANTA','NEONIX','ASTRAE'];
  const companies=['MIRA Entertainment','Orbit Works','HANEUL Media','Vivid Lab','Northstar Entertainment','JUNO Music'];
  const grades=['F','D','C','B','A'];
  const hash=text=>[...String(text)].reduce((n,ch)=>(n*31+ch.charCodeAt(0))>>>0,2166136261);
  const pick=(arr,seed,offset=0)=>arr[(hash(seed)+offset)%arr.length];
  const normalizedGrade=(value,seed,offset)=>value==='random'?pick(grades,seed,offset):value;

  const parseChoices=raw=>{
    const map=new Map();
    String(raw||'').split(/\r?\n/).slice(-18).forEach(line=>{
      const m=line.trim().match(/^(?:\*\*)?([1-5])(?:\.\*\*|\*\*\.|[.、：:])\s*(.+?)\s*$/);
      if(m) map.set(m[1],m[2].replace(/\*\*$/,'').trim());
    });
    return ['1','2','3','4','5'].map(key=>({key,text:map.get(key)||''})).filter(x=>x.text);
  };

  const mountChoices=()=>{
    document.getElementById('idol-survival-turn-choices')?.remove();
    if(!isIdol()||!document.getElementById('chat-view')?.classList.contains('active')) return;
    const last=[...(Chat.messages||[])].reverse().find(m=>m?.role==='assistant'&&!m?.greeting);
    const choices=parseChoices(last?.content||'');
    if(choices.filter(x=>x.key!=='5').length<2) return;
    const composer=document.querySelector('#chat-view .composer');
    if(!composer) return;
    const wrap=document.createElement('div');
    wrap.id='idol-survival-turn-choices';
    wrap.className='idol-survival-turn-choices';
    wrap.innerHTML=choices.map(x=>`<button type="button" data-idol-choice="${x.key}"><span>${x.key}</span>${esc(x.text)}</button>`).join('');
    wrap.addEventListener('click',event=>{
      const btn=event.target.closest?.('[data-idol-choice]');
      if(!btn) return;
      const input=document.getElementById('user-input');
      const choice=choices.find(x=>x.key===btn.dataset.idolChoice);
      if(!input||!choice) return;
      input.value=choice.key==='5'?'':choice.text;
      input.focus();
      input.setSelectionRange?.(input.value.length,input.value.length);
    });
    composer.before(wrap);
  };

  const meter=(label,value,max=100)=>{
    const n=Math.max(0,Math.min(max,Number(value)||0));
    return `<div class="idol-meter"><div><span>${esc(label)}</span><b>${n}</b></div><i><em style="width:${max?n/max*100:0}%"></em></i></div>`;
  };

  const grade=(label,value)=>`<div class="idol-grade"><small>${esc(label)}</small><b>${esc(value||'—')}</b></div>`;

  const originalRenderDetail=App.renderDetail.bind(App);
  App.renderDetail=function(){
    if(!isIdol()) return originalRenderDetail();
    const c=this.activeCharacter;
    ['detail','builder','chat'].forEach(v=>document.getElementById(v+'-view')?.setAttribute('data-category-theme','male'));
    document.getElementById('character-detail').innerHTML=`
      <section class="idol-detail">
        <button class="back-link idol-back" type="button">← 返回作品區</button>
        <div class="idol-hero">
          <div class="idol-hero-art"><img src="${App.escapeAttr(cover())}" alt="大型偶像選秀舞台與九個出道席剪影" decoding="async"></div>
          <div class="idol-hero-copy">
            <span class="idol-kicker">K-IDOL SURVIVAL / DEBUT PROJECT</span>
            <h1>${esc(c.title||c.name)}</h1>
            <p>${esc(c.description||'')}</p>
            <blockquote>${esc(c.quote||'')}</blockquote>
            <div class="tags">${(c.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>
            <div class="idol-actions"><button class="primary" data-idol-start>收到入選通知</button><span>初評 · 競演 · 排名 · 剪輯 · 淘汰 · 出道</span></div>
          </div>
        </div>
        <div class="idol-section-head">
          <div><span class="idol-kicker">SURVIVAL SYSTEM</span><h2>不是每個鏡頭都公平，也不是每次失敗都會直接淘汰。</h2></div>
          <p>能力、舞台、人氣、關係與節目敘事會互相影響；NPC 也會成長、犯錯、被看見或離開。</p>
        </div>
        <div class="idol-feature-grid">
          <article><b>舞台真的會累積</b><span>評級不會無理由暴漲；A 級後成長更慢，S 級只留給充分鋪墊的高光。</span></article>
          <article><b>排名不是固定劇本</b><span>舞台、成長、人氣趨勢、剪輯與已發生的人際事件共同改變結果。</span></article>
          <article><b>NPC 不全員喜歡你</b><span>同宿舍、同隊、競爭對手都各有公司、目標、情緒與自己的淘汰風險。</span></article>
          <article><b>保留二創入口</b><span>可輸入現實偶像／團體作靈感，故事會明確轉為平行世界版本，不把私生活當事實。</span></article>
        </div>
      </section>`;
    document.querySelector('.idol-back')?.addEventListener('click',()=>this.showView('explore'));
    document.querySelector('[data-idol-start]')?.addEventListener('click',()=>this.openBuilder());
  };

  const get=id=>document.getElementById(id)?.value||'';
  const renderConfirm=()=>{
    const root=document.getElementById('idol-survival-confirm');
    if(!root) return;
    const entry=get('idol-entry')||'A';
    const entryLabel={A:'個人投遞',B:'公司推薦',C:'星探發掘'}[entry]||entry;
    root.innerHTML=`
      <b>練習生資料確認</b>
      <p>${esc(get('idol-name')||'隨機姓名')} · ${esc(get('idol-age')||'隨機')}歲 · ${esc(get('idol-gender')||'隨機性別')} · ${esc(get('idol-nationality')||'隨機國籍')} · ${esc(entryLabel)}</p>
      <small>聲樂 ${esc(get('idol-vocal')||'隨機')} / 舞蹈 ${esc(get('idol-dance')||'隨機')} / 外貌 ${esc(get('idol-visual')||'隨機')} / 才氣 ${esc(get('idol-talent')||'隨機')} · 特性 ${esc(get('idol-trait')||'隨機')} · 情感線 ${esc(get('idol-romance')||'慢熱開啟')}。按下「確認資料・進入節目」後才正式開場。</small>`;
  };

  const originalOpenBuilder=App.openBuilder.bind(App);
  App.openBuilder=function(){
    originalOpenBuilder();
    if(!isIdol()) return;
    const panel=document.querySelector('.builder-step[data-step-panel="3"]');
    if(panel&&!panel.querySelector('#idol-survival-setup')){
      const box=document.createElement('section');
      box.id='idol-survival-setup';
      box.className='idol-builder-box';
      box.innerHTML=`
        <div class="idol-builder-title"><span>TRAINEE PROFILE</span><b>練習生資料</b></div>
        <div class="form-grid">
          <label>姓名<input id="idol-name" maxlength="40" placeholder="留空＝隨機"></label>
          <label>年齡<input id="idol-age" type="number" min="16" max="22" value="19"></label>
          <label>性別<input id="idol-gender" maxlength="30" placeholder="女 / 男 / 自訂"></label>
          <label>國籍<input id="idol-nationality" maxlength="40" value="韓國" placeholder="韓國 / 台灣 / 日本…"></label>
          <label>外貌風格<input id="idol-appearance" maxlength="120" placeholder="清純 / 冷艷 / 少年感 / 可愛 / 普通但上鏡…"></label>
          <label>性格傾向<input id="idol-personality" maxlength="120" placeholder="慢熱、好勝、溫和、外冷內熱…"></label>
          <label>聲樂評級<select id="idol-vocal"><option value="random">隨機</option><option>F</option><option>D</option><option selected>C</option><option>B</option><option>A</option></select></label>
          <label>舞蹈評級<select id="idol-dance"><option value="random">隨機</option><option>F</option><option>D</option><option selected>C</option><option>B</option><option>A</option></select></label>
          <label>外貌評級<select id="idol-visual"><option value="random">隨機</option><option>F</option><option>D</option><option selected>C</option><option>B</option><option>A</option></select></label>
          <label>才氣評級<select id="idol-talent"><option value="random">隨機</option><option>F</option><option>D</option><option selected>C</option><option>B</option><option>A</option></select></label>
          <label>特性<select id="idol-trait"><option>隨機</option><option>努力型</option><option>天才型</option><option>顏值加成</option><option>舞台體質</option><option>綜藝感強</option><option>訓練狂</option><option>運氣好</option><option>共情力</option></select></label>
          <label>入選方式<select id="idol-entry"><option value="A">A. 自己投遞報名信</option><option value="B">B. 經紀公司安排</option><option value="C">C. 被星探發掘</option></select></label>
          <label>情感線<select id="idol-romance"><option>慢熱開啟</option><option>開啟</option><option>不開啟</option></select></label>
          <label>NPC 模式<select id="idol-npc-mode"><option>原創同場練習生</option><option>現實偶像／團體二創</option><option>自己填寫練習生</option><option>隨機生成</option></select></label>
        </div>
        <label>二創／自訂 NPC 參考<textarea id="idol-npc-text" maxlength="800" rows="3" placeholder="可輸入團體、人物、氣質或自訂人設。現實人物會作為平行世界版本處理。"></textarea></label>
        <div id="idol-survival-confirm" class="idol-confirm"></div>`;
      panel.appendChild(box);
      box.addEventListener('input',renderConfirm);
      box.addEventListener('change',renderConfirm);
      renderConfirm();
    }
    setTimeout(()=>{const start=document.getElementById('start-story');if(start)start.textContent='確認資料・進入節目';},0);
  };

  const originalCollectConfig=App.collectConfig.bind(App);
  App.collectConfig=function(){
    const cfg=originalCollectConfig();
    if(!isIdol()) return cfg;
    const raw={
      name:get('idol-name').trim()||'隨機',
      age:Number(get('idol-age')||19),
      gender:get('idol-gender').trim()||'隨機',
      nationality:get('idol-nationality').trim()||'韓國',
      appearance:get('idol-appearance').trim()||'隨機',
      personality:get('idol-personality').trim()||'隨機',
      vocal:get('idol-vocal')||'C',
      dance:get('idol-dance')||'C',
      visual:get('idol-visual')||'C',
      talent:get('idol-talent')||'C',
      trait:get('idol-trait')||'隨機',
      entry:get('idol-entry')||'A',
      romance:get('idol-romance')||'慢熱開啟',
      npcMode:get('idol-npc-mode')||'原創同場練習生',
      npcText:get('idol-npc-text').trim()
    };
    const seed=JSON.stringify(raw);
    const setup={...raw};
    setup.programName=pick(programs,seed,11);
    setup.debutGroup=pick(groups,seed,23);
    setup.company=setup.entry==='B'?pick(companies,seed,37):'無';
    setup.vocal=normalizedGrade(raw.vocal,seed,41);
    setup.dance=normalizedGrade(raw.dance,seed,43);
    setup.visual=normalizedGrade(raw.visual,seed,47);
    setup.talent=normalizedGrade(raw.talent,seed,53);
    if(setup.trait==='隨機') setup.trait=pick(['努力型','天才型','顏值加成','舞台體質','綜藝感強','訓練狂','運氣好','共情力'],seed,59);
    cfg.idolSurvivalSetup=setup;
    cfg.narrativeMode='world';
    cfg.displayMode='ui';
    if(setup.name!=='隨機'&&!cfg.persona.name) cfg.persona.name=setup.name;
    cfg.persona.extra=[cfg.persona.extra,`選秀設定：${setup.name}；${setup.age}歲；${setup.gender}；${setup.nationality}；外貌=${setup.appearance}；性格=${setup.personality}；聲樂=${setup.vocal}；舞蹈=${setup.dance}；外貌評級=${setup.visual}；才氣=${setup.talent}；特性=${setup.trait}；入選=${setup.entry}；情感線=${setup.romance}；NPC=${setup.npcMode}${setup.npcText?'：'+setup.npcText:''}`].filter(Boolean).join('\n');
    return cfg;
  };

  const originalBuildSystemPrompt=App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt=function(){
    const base=originalBuildSystemPrompt();
    const s=this.config?.idolSurvivalSetup;
    if(!isIdol()||!s) return base;
    const entry={A:'自己投遞報名信／個人練習生',B:'經紀公司推薦',C:'被星探發掘'}[s.entry]||s.entry;
    return base+`\n\n【本局固定設定】節目=${s.programName}；最終出道團=${s.debutGroup}；玩家=${s.name}／${s.age}歲／${s.gender}／${s.nationality}；入選方式=${entry}；所屬公司=${s.company}；情感線=${s.romance}；核心練習生 NPC 必須與玩家同性別、同國籍。若有二創參考，只當作平行世界虛構人物，不推斷真實私生活。不要直接向玩家重複這段後台設定。\n【開局差異】A：自己報名後等到通知，看見別人從保姆車下來時會更明顯感受到個人練習生處境。B：通知由公司轉發，出發前在公司練習到很晚，公司只留下一句「好好表現」。C：玩家沒有正式報名，是星探把資料送進節目，手機仍留著「相信我就對了」的訊息。`;
  };

  const applyInitialState=()=>{
    if(!isIdol()||!GameState.current||!App.config?.idolSurvivalSetup) return false;
    const state=GameState.current;
    if(state.idolSurvivalInitializedVersion>=1) return true;
    const fresh=(Chat.messages||[]).length<=1&&(!Chat.messages.length||Chat.messages[0]?.greeting);
    if(!fresh){state.idolSurvivalInitializedVersion=1;return true;}
    const s=App.config.idolSurvivalSetup, modules=state.modules;
    if(!modules?.survival_show||!modules?.trainee_profile||!modules?.ranking_state) return false;
    Object.assign(modules.survival_show,{program_name:s.programName,debut_group:s.debutGroup,week:0,day:'錄製 Day 1',time_slot:'上午',location:'節目組大樓',phase:'入場／第一次評級前',trainee_count:101,debut_slots:9});
    Object.assign(modules.trainee_profile,{company:s.company,vocal:s.vocal,dance:s.dance,visual:s.visual,talent:s.talent,trait:s.trait,condition:'良好'});
    Object.assign(modules.ranking_state,{rank:0,trend:'尚未公開',buzz:5,edit_tone:'尚未播出',vote_band:'未公開'});
    if(modules.stage_state) Object.assign(modules.stage_state,{mission:'第一次評級考核',song:'自備舞台',position:'未定',team:'個人',status:'等待報到',last_grade:'無',highlight:'尚無'});
    if(modules.pressure_state) Object.assign(modules.pressure_state,{fatigue:s.entry==='B'?18:8,stress:s.entry==='C'?28:22,injury:'無',crisis:'無'});
    state.idolSurvivalPrivate={programName:s.programName,debutGroup:s.debutGroup,entry:s.entry,npcMode:s.npcMode,npcText:s.npcText};
    state.idolSurvivalInitializedVersion=1;
    return true;
  };
  const ensureInitialState=(n=0)=>{
    if(applyInitialState()) return;
    if(n>=30||!isIdol()||!GameState.current) return;
    setTimeout(()=>ensureInitialState(n+1),50);
  };

  const originalRenderUIPanel=App.renderUIPanel.bind(App);
  App.renderUIPanel=function(panel){
    if(!isIdol()||!GameState.current) return originalRenderUIPanel(panel);
    const ui=document.getElementById('ui-panel');
    if(!ui) return;
    const m=GameState.current.modules||{};
    if(panel==='status'){
      const show=m.survival_show||{}, p=m.trainee_profile||{}, rank=m.ranking_state||{}, stage=m.stage_state||{}, pressure=m.pressure_state||{};
      ui.innerHTML=`
        <div class="idol-status-shell">
          <section class="idol-status-card show">
            <div class="idol-status-title"><span>ON AIR</span><b>${esc(show.program_name||'—')}</b></div>
            <div class="idol-status-grid"><div><small>賽程</small><b>${esc(show.phase||'—')}</b></div><div><small>週次</small><b>W${esc(show.week??0)}</b></div><div><small>剩餘</small><b>${esc(show.trainee_count??101)}</b></div><div><small>出道席</small><b>${esc(show.debut_slots??9)}</b></div></div>
            <p>${esc(show.day||'—')} · ${esc(show.time_slot||'—')} · ${esc(show.location||'—')} · 出道團 ${esc(show.debut_group||'待公布')}</p>
          </section>
          <section class="idol-status-card profile">
            <div class="idol-status-title"><span>TRAINEE</span><b>${esc(p.company||'無')}</b></div>
            <div class="idol-grade-grid">${grade('聲樂',p.vocal)}${grade('舞蹈',p.dance)}${grade('外貌',p.visual)}${grade('才氣',p.talent)}</div>
            <p>特性：${esc(p.trait||'—')} · 狀態：${esc(p.condition||'—')}</p>
          </section>
          <section class="idol-status-card rank">
            <div class="idol-status-title"><span>RANKING</span><b>${Number(rank.rank)>0?'#'+esc(rank.rank):'未公開'}</b></div>
            <div class="idol-status-grid"><div><small>趨勢</small><b>${esc(rank.trend||'—')}</b></div><div><small>剪輯</small><b>${esc(rank.edit_tone||'—')}</b></div></div>
            ${meter('話題度',rank.buzz)}
            <p>票數：${esc(rank.vote_band||'未公開')}</p>
          </section>
          <section class="idol-status-card stage">
            <div class="idol-status-title"><span>MISSION</span><b>${esc(stage.mission||'—')}</b></div>
            <div class="idol-status-grid"><div><small>曲目</small><b>${esc(stage.song||'—')}</b></div><div><small>位置</small><b>${esc(stage.position||'—')}</b></div><div><small>隊伍</small><b>${esc(stage.team||'—')}</b></div><div><small>進度</small><b>${esc(stage.status||'—')}</b></div></div>
            <p>近期亮點：${esc(stage.highlight||'尚無')}</p>
          </section>
          <section class="idol-status-card pressure">
            <div class="idol-status-title"><span>BACKSTAGE</span><b>${esc(pressure.crisis||'無危機')}</b></div>
            <div class="idol-pressure-grid">${meter('疲勞',pressure.fatigue)}${meter('壓力',pressure.stress)}</div>
            <p>傷病：${esc(pressure.injury||'無')}</p>
          </section>
        </div>`;
      return;
    }
    return originalRenderUIPanel(panel);
  };

  const originalSendMessage=App.sendMessage.bind(App);
  App.sendMessage=async function(...args){
    const result=await originalSendMessage(...args);
    if(isIdol()) setTimeout(mountChoices,0);
    return result;
  };

  const originalRenderChatShell=App.renderChatShell.bind(App);
  App.renderChatShell=function(fresh=false){
    applyInitialState();
    originalRenderChatShell(fresh);
    if(!isIdol()) return;
    ensureInitialState();
    const s=App.config?.idolSurvivalSetup;
    const card=document.getElementById('chat-character-card');
    if(card) card.innerHTML=`<div class="idol-chat-badge"><span>${esc(s?.programName||'K-IDOL SURVIVAL')}</span><b>${esc(s?.debutGroup||'DEBUT PROJECT')}</b></div>`;
    document.querySelector('.ui-tab[data-panel="status"]')?.click();
    setTimeout(mountChoices,0);
  };

  window.BAOIdolSurvival={parseChoices,mountChoices,applyInitialState};
})();
