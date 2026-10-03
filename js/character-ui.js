(() => {
  if (typeof App === 'undefined' || typeof CharacterEngine === 'undefined') return;
  const categoryMeta = {
    general:{label:'一般向',en:'GENERAL',desc:'不限定主要受眾的作品。',kicker:'GENERAL STORY'},
    female:{label:'女性向',en:'FEMALE ORIENTED',desc:'以偏好女性向作品的讀者為主要受眾。',kicker:'FEMALE ORIENTED'},
    male:{label:'男性向',en:'MALE ORIENTED',desc:'以偏好男性向作品的讀者為主要受眾。',kicker:'MALE ORIENTED'}
  };
  const workCategory = character => {
    const resolved = window.BAOExploreDiscoveryCore?.workCategory?.(character);
    if (resolved) return resolved;
    return ['general','female','male'].includes(character?.category) ? character.category : 'general';
  };
  const adultEnabled = () => Boolean(window.BAOContentPreferences?.isAdultContentEnabled?.());
  const worldId = 'autonomous-npc-world';
  const worldOptions = ['現代都市','成人校園日常','都市奇幻','賽博朋克','奇幻冒險','末日廢土','科幻太空','恐怖驚悚','自訂世界觀'];
  const loadCharacterCatalog = App.loadCharacters.bind(App);
  App.loadCharacters = async function(){await loadCharacterCatalog();window.BAORefreshHomeCharacterPreview?.()};
  App.renderCharacters = function(filter='all'){
    const list=document.getElementById('character-list');
    if(!list)return;
    const requested=['general','male','female','r18'].includes(filter)?filter:'all';
    const active=requested==='r18'&&!adultEnabled()?'all':requested;
    const chars=this.characters.filter(character=>{
      const adult=window.BAOContentPreferences?.isAdult?.(character)===true;
      if(adult&&!adultEnabled())return false;
      if(active==='r18')return adult;
      if(active==='all')return true;
      return workCategory(character)===active;
    });
    document.getElementById('explore-view')?.setAttribute('data-category-theme',active==='r18'?'all':active);
    document.querySelectorAll('.category-portal').forEach(x=>x.classList.toggle('active',x.dataset.category===active));
    const cards=chars.length?chars.map(character=>{
      const category=workCategory(character);
      const meta=categoryMeta[category]||categoryMeta.general;
      const orientationBadge=category==='general'?'':`<span class="category-badge">${this.escapeHTML(meta.label)}</span>`;
      const adultBadge=window.BAOContentPreferences?.isAdult?.(character)===true?'<span class="rating-badge">18+</span>':'';
      return `<article class="character-card category-${this.escapeAttr(category)}" data-character-id="${this.escapeAttr(character.id)}" tabindex="0" role="button" aria-label="預覽 ${this.escapeAttr(character.title||character.name)}"><div class="character-image-wrap"><img src="${this.escapeAttr(character.avatar)}" alt="${this.escapeAttr(character.name)}" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer">${orientationBadge}${adultBadge}</div><div class="character-content"><div class="eyebrow">${this.escapeHTML(meta.en)}</div><h3>${this.escapeHTML(character.title||character.name)}</h3><p>${this.escapeHTML(character.description)}</p><div class="tags">${(character.tags||[]).map(tag=>`<span class="tag">#${this.escapeHTML(tag)}</span>`).join('')}</div></div></article>`;
    }).join(''):`<div class="empty-category"><b>${active==='all'?'目前還沒有更多作品':active==='r18'?'目前沒有成人內容作品':(categoryMeta[active]?.label||'這個取向')+'目前還沒有作品'}</b><span>作品取向描述主要受眾，不代表角色性別。</span></div>`;
    const more=this.hasMoreCharacterCatalog?.()?`<div class="character-load-more"><button type="button" class="secondary" id="character-load-more">載入更多作品</button></div>`:'';
    list.innerHTML=cards+more;
    list.querySelectorAll('[data-character-id]').forEach(card=>{
      const open=()=>{const id=card.dataset.characterId;if(window.BAOExploreDiscovery?.openPreview?.(id))return;this.openCharacter(id)};
      card.addEventListener('click',event=>{if(event.target.closest?.('[data-explore-favorite]'))return;open()});
      card.addEventListener('keydown',event=>{if(event.target!==card||!['Enter',' '].includes(event.key))return;event.preventDefault();open()});
    });
    const moreButton=document.getElementById('character-load-more');
    if(moreButton)moreButton.addEventListener('click',async()=>{moreButton.disabled=true;moreButton.textContent='載入中…';try{await this.loadMoreCharacters();this.renderCharacters(active)}catch(error){console.error('BAO/LAB community catalog load failed:',error);moreButton.disabled=false;moreButton.textContent='載入失敗，點此重試'}});
  };
  App.renderDetail = function(){
    const c=this.activeCharacter;
    if(!c)return;
    const category=workCategory(c);
    const meta=categoryMeta[category]||categoryMeta.general;
    const adult=window.BAOContentPreferences?.isAdult?.(c)===true;
    ['detail','builder','chat'].forEach(v=>document.getElementById(v+'-view')?.setAttribute('data-category-theme',category));
    document.getElementById('character-detail').innerHTML=`<div class="detail-theme-shell detail-${category}"><button class="back-link" type="button" id="detail-back">← 返回作品區</button><div class="detail-theme-layout"><div class="detail-visual"><div class="detail-image-frame"><img class="detail-image" src="${this.escapeAttr(c.avatar)}" alt="${this.escapeAttr(c.name)}"><span class="detail-category-badge">${this.escapeHTML(meta.label)}${adult?' · 18+':''}</span></div><div class="detail-side-code">${this.escapeHTML(meta.kicker)}</div></div><div class="detail-copy"><div class="detail-category-line"><span>${this.escapeHTML(meta.en)}${adult?' · MATURE':''}</span><i></i></div><h1>${this.escapeHTML(c.title||c.name)}</h1><p class="detail-description">${this.escapeHTML(c.description||'')}</p>${c.quote?`<div class="quote">${this.escapeHTML(c.quote)}</div>`:''}<div class="tags">${(c.tags||[]).map(t=>`<span class="tag">#${this.escapeHTML(t)}</span>`).join('')}</div><div class="detail-actions"><button class="primary detail-start" id="detail-start">開始故事</button><a class="detail-first-run" href="quick-start.html">第一次來？三步開始 ↗</a><span class="detail-mode-note">${c.supported_modes?.world?'支援世界模擬':'單角色沉浸'} · ${c.supported_display?.ui?'支援互動 UI':'純文本'}</span></div></div></div></div>`;
    document.getElementById('detail-back').addEventListener('click',()=>this.showView('explore'));
    document.getElementById('detail-start').addEventListener('click',()=>this.openBuilder());
  };
  App.buildSystemPrompt=function(){const mode=this.prompts[this.config.narrativeMode];const base=CharacterEngine.composeSystemPrompt(this.activeCharacter,{persona:this.config.persona,modePrompt:mode?.prompt||'',displayMode:this.config.displayMode,recentMessages:typeof Chat!=='undefined'?(Chat.messages||[]).slice(-12):[],storyNPCs:typeof GameState!=='undefined'?(GameState.current?.npcs||[]):[],currentLocation:typeof GameState!=='undefined'?(GameState.current?.location||''):''});const setup=this.config.worldSetup;if(this.activeCharacter?.id!==worldId||!setup)return base;return base+'\n\n【本次世界開局】\n世界觀：'+setup.world+'\n開局方式：'+setup.mode+'\n'+(setup.detail?'補充：'+setup.detail+'\n':'')+'僅依已建立的世界狀態推進，不要重新詢問已選擇的開局項目。'};
  const originalOpenBuilder=App.openBuilder.bind(App);
  App.openBuilder=function(){originalOpenBuilder();const panel=document.querySelector('.builder-step[data-step-panel="1"]');if(!panel)return;panel.querySelector('#autonomous-world-setup')?.remove();if(this.activeCharacter?.id!==worldId)return;const section=document.createElement('section');section.id='autonomous-world-setup';section.style.cssText='margin-top:18px;padding:16px;border:1px solid #8772cf;border-radius:14px;background:linear-gradient(135deg,#30264d,#453067);color:#fff';section.innerHTML='<h3>🌟 動態世界模擬器 · 開局設定</h3><p>NPC 有自己的生活、目標與界線。你的選擇會帶進故事，而不是要求 AI 再問一次。</p><label for="npc-world-mode">🎮 開局方式</label><select id="npc-world-mode" style="display:block;width:100%;margin:6px 0 14px;padding:10px"><option value="immersive">🎭 單角色深度互動</option><option value="world">🌍 完整世界（多 NPC）</option><option value="custom">⚙️ 自訂開局</option></select><label for="npc-world-type">🌍 世界觀</label><select id="npc-world-type" style="display:block;width:100%;margin:6px 0 14px;padding:10px"></select><label for="npc-world-detail">✏️ 自訂場景／NPC（選填）</label><textarea id="npc-world-detail" maxlength="1000" rows="3" style="display:block;width:100%;margin:6px 0 14px;padding:10px" placeholder="地點、角色、初始關係或世界設定……"></textarea><p style="font-size:13px">🖥️ 純文字或網站 UI 可在下一步選擇；作者 HTML 依網站的場景排版功能設定。</p>';panel.appendChild(section);const select=section.querySelector('#npc-world-type');worldOptions.forEach(name=>{const option=document.createElement('option');option.textContent=name;select.appendChild(option)});const mode=section.querySelector('#npc-world-mode');const narrative=document.querySelector('input[name="narrative-mode"]:checked');mode.value=narrative?.value==='world'?'world':'immersive';mode.addEventListener('change',()=>{const radio=document.querySelector(`input[name="narrative-mode"][value="${mode.value==='immersive'?'immersive':'world'}"]`);if(radio){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}))}})};
  const originalCollectConfig=App.collectConfig.bind(App);
  App.collectConfig=function(){const cfg=originalCollectConfig();if(this.activeCharacter?.id===worldId){const section=document.getElementById('autonomous-world-setup');if(section){cfg.worldSetup={mode:section.querySelector('#npc-world-mode').value,world:section.querySelector('#npc-world-type').value,detail:section.querySelector('#npc-world-detail').value.trim()};cfg.narrativeMode=cfg.worldSetup.mode==='immersive'?'immersive':'world'}}return cfg};
  function openCategory(category){App.renderCharacters(category);document.getElementById('character-list')?.scrollIntoView({behavior:'smooth',block:'start'})}
  window.addEventListener('yorubay:content-preferences-changed',()=>{App.renderCharacters(document.querySelector('.category-portal.active')?.dataset.category||'all')});
  window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{const explore=document.getElementById('explore-view'),head=explore?.querySelector('.section-head');if(!explore||!head||document.getElementById('category-portals'))return;head.querySelector('.filters')?.remove();document.getElementById('adult-notice')?.remove();head.querySelector('h2')?.insertAdjacentHTML('afterend','<p class="explore-lead">作品取向描述主要受眾，不代表角色性別；沒有明確取向的作品會歸在一般向。成人內容則由內容分級另外控制。</p>');const portals=document.createElement('div');portals.id='category-portals';portals.className='category-portals';portals.innerHTML=Object.entries(categoryMeta).map(([key,meta],i)=>`<button type="button" class="category-portal portal-${key}" data-category="${key}"><span class="portal-index">0${i+1}</span><span class="portal-en">${meta.en}</span><strong>${meta.label}</strong><span class="portal-desc">${meta.desc}</span><span class="portal-arrow">進入作品區 →</span></button>`).join('');head.insertAdjacentElement('afterend',portals);portals.querySelectorAll('.category-portal').forEach(btn=>btn.addEventListener('click',()=>openCategory(btn.dataset.category)));const tools=document.createElement('div');tools.className='character-tools';tools.innerHTML='<a class="primary" href="character-studio.html">＋ 角色卡創作室</a><button id="import-character-button" class="secondary" type="button">匯入角色卡（JSON／PNG）</button><button id="manage-character-button" class="secondary" type="button">管理本機角色</button><a class="secondary" href="data/characters/character-template.json" download>下載角色模板</a><input id="import-character-file" type="file" accept="application/json,.json,image/png,.png" hidden><span id="character-import-status" class="note"></span><div id="custom-character-list" style="width:100%"></div>';portals.insertAdjacentElement('afterend',tools);const picker=document.getElementById('import-character-file'),status=document.getElementById('character-import-status'),listBox=document.getElementById('custom-character-list');const refresh=()=>{const seen=new Set();App.characters=[...CharacterEngine.loadCustom(),...App.characters.filter(c=>c.source!=='local-import')].filter(c=>!seen.has(c.id)&&seen.add(c.id));App.renderCharacters(document.querySelector('.category-portal.active')?.dataset.category||'all')};const renderList=()=>{const custom=CharacterEngine.loadCustom().filter(c=>window.BAOContentPreferences?.canExpose?.(c)!==false);listBox.innerHTML=custom.length?custom.map(c=>`<div class="note local-character-row"><b>${App.escapeHTML(c.title||c.name)}</b><span>${App.escapeHTML((categoryMeta[workCategory(c)]||categoryMeta.general).label)}${window.BAOContentPreferences?.isAdult?.(c)?' · 18+':''}</span><span>${App.escapeHTML(c.id)}</span><button class="text-button" data-remove-character="${App.escapeAttr(c.id)}">移除</button></div>`).join(''):'<div class="note" style="margin-top:8px">目前沒有本機匯入角色。</div>';listBox.querySelectorAll('[data-remove-character]').forEach(btn=>btn.addEventListener('click',()=>{CharacterEngine.removeCustom(btn.dataset.removeCharacter);refresh();renderList()}))};document.getElementById('import-character-button').addEventListener('click',()=>picker.click());document.getElementById('manage-character-button').addEventListener('click',renderList);picker.addEventListener('change',async()=>{const file=picker.files?.[0];if(!file)return;status.textContent='匯入中…';try{const c=await (CharacterEngine.requestImport?.(file)||CharacterEngine.importFile(file));status.textContent=`✓ 已匯入：${c.name}`;refresh();renderList()}catch(err){status.textContent=`✕ ${err.message||'匯入失敗'}`}finally{picker.value=''}});App.renderCharacters('all')},220));
})();
