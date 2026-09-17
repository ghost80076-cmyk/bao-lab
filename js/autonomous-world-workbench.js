(() => {
  'use strict';
  const ID = 'autonomous-npc-world';
  const originalOpen = App.openBuilder.bind(App);
  const originalCollect = App.collectConfig.bind(App);
  const originalPrompt = App.buildSystemPrompt.bind(App);
  const originalShell = App.renderChatShell.bind(App);
  const originalResume = App.resumeSavedStory.bind(App);
  const blank = () => ({mode:'immersive',world:'現代都市',references:'',tone:'',worldText:'',npcs:'',personaText:'',opening:'',confirmed:{world:false,npcs:false,persona:false}});
  const draftKey = 'bao-lab:world-draft:'+ID;
  let draft = blank();
  const text = id => document.getElementById('aw-'+id)?.value.trim() || '';
  function loadDraft() {
    try { const value=JSON.parse(localStorage.getItem(draftKey)||'null'); return value&&typeof value==='object'?{...blank(),...value,confirmed:{...blank().confirmed,...value.confirmed}}:blank(); }
    catch { return blank(); }
  }
  function saveDraft() { try { localStorage.setItem(draftKey,JSON.stringify(draft)); } catch {} }
  function render() {
    const panel=document.querySelector('.builder-step[data-step-panel="1"]');
    if (!panel) return;
    panel.querySelector('#autonomous-world-setup')?.remove();
    const el=document.createElement('section'); el.id='autonomous-world-setup'; el.className='aw-workbench';
    el.innerHTML=`<style>.aw-workbench{margin:18px 0;padding:18px;border:1px solid #8e7bd5;border-radius:18px;background:linear-gradient(135deg,#30244c,#48346c);color:#fff}.aw-workbench h3{margin:0 0 8px}.aw-workbench label{display:block;margin:12px 0 4px}.aw-workbench select,.aw-workbench textarea,.aw-workbench input{box-sizing:border-box;width:100%;padding:10px;border-radius:9px;border:1px solid #b5a6e5;background:#211b35;color:#fff;font:inherit}.aw-workbench textarea{min-height:100px;resize:vertical}.aw-workbench .aw-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.aw-workbench button{padding:9px 12px;border-radius:9px;border:1px solid #a999e6;background:#6351a5;color:white;cursor:pointer}.aw-workbench small{color:#e0d6ff}.aw-workbench details{margin-top:12px}.aw-workbench summary{cursor:pointer;font-weight:600}@media(max-width:600px){.aw-workbench{padding:12px}.aw-workbench button{width:100%}}</style>
    <h3>🌟 自主 NPC 世界 · 世界創建器</h3><p>先建立並確認世界、NPC 與玩家資料，再開始冒險。顯示方式在下一步設定，不會再要求 AI 選 HTML 或純文字。</p>
    <label for="aw-mode">🎮 冒險方式</label><select id="aw-mode"><option value="immersive">🎭 單角色</option><option value="multi">👥 多角色</option><option value="world">🌍 完整世界</option><option value="mixed">🧩 混合／自訂世界</option></select>
    <label for="aw-world">🌍 世界類型</label><select id="aw-world">${['現代都市','成人校園日常','都市奇幻','賽博朋克','奇幻冒險','末日廢土','科幻太空','恐怖驚悚','自訂世界觀'].map(x=>`<option>${x}</option>`).join('')}</select>
    <label for="aw-references">📚 參考作品／融合方向（選填）</label><textarea id="aw-references" placeholder="參考 A 小說的社會背景，融合 B 動漫的能力體系；也可以直接貼入已整理的背景。"></textarea>
    <label for="aw-tone">🎨 故事風格與額外要求（選填）</label><input id="aw-tone" placeholder="輕鬆、戀愛、冒險；特定場景、角色或規則……">
    <details open><summary>📝 世界觀純文字草稿</summary><textarea id="aw-worldText" placeholder="可貼入其他角色卡、小說筆記或其他 AI 整理的純文字世界觀。"></textarea><div class="aw-actions"><button type="button" data-aw-generate="world">使用自己的 API 生成世界觀</button><button type="button" data-aw-remember="world">記住世界觀</button></div><small id="aw-world-status"></small></details>
    <details><summary>👥 NPC 與人物關係</summary><textarea id="aw-npcs" placeholder="NPC 名稱、背景、目標、關係與知識界線……"></textarea><div class="aw-actions"><button type="button" data-aw-generate="npcs">使用自己的 API 建立 NPC</button><button type="button" data-aw-remember="npcs">記住 NPC</button></div><small id="aw-npcs-status"></small></details>
    <details><summary>🧑 玩家個人資料</summary><textarea id="aw-personaText" placeholder="玩家身分、經歷、能力與其他設定。"></textarea><div class="aw-actions"><button type="button" data-aw-generate="persona">使用自己的 API 建立個人資料</button><button type="button" data-aw-remember="persona">記住個人資料</button></div><small id="aw-persona-status"></small></details>
    <label for="aw-opening">🎬 開場情境（選填）</label><textarea id="aw-opening" placeholder="例如：雨夜抵達陌生城市。留空則由模型依確認的世界觀生成第一幕。"></textarea><small id="aw-message" role="status" aria-live="polite"></small>`;
    panel.appendChild(el);
    const status=name=>{el.querySelector('#aw-'+name+'-status').textContent=draft.confirmed[name]?'✓ 已記住到本機開局設定':'尚未記住；可修改後再按「記住」';};
    for(const key of ['mode','world','references','tone','worldText','npcs','personaText','opening']){
      const input=el.querySelector('#aw-'+key);input.value=draft[key]||'';
      input.addEventListener('input',()=>{draft[key]=input.value;if(['worldText','npcs','personaText'].includes(key)){const name=key==='worldText'?'world':key==='personaText'?'persona':key;draft.confirmed[name]=false;status(name);}saveDraft();});
    }
    ['world','npcs','persona'].forEach(status);
    el.querySelectorAll('[data-aw-remember]').forEach(btn=>btn.addEventListener('click',()=>{
      const name=btn.dataset.awRemember,key=name==='world'?'worldText':name==='persona'?'personaText':name;
      if(!text(key)){el.querySelector('#aw-message').textContent='請先填寫內容再記住。';return;}
      draft[key]=text(key);draft.confirmed[name]=true;saveDraft();status(name);
      el.querySelector('#aw-message').textContent='已儲存至這台裝置的開局草稿；開始故事後會一併存入故事設定。';
    }));
    el.querySelectorAll('[data-aw-generate]').forEach(btn=>btn.addEventListener('click',()=>generate(btn.dataset.awGenerate,btn)));
  }
  async function generate(name,btn){
    const preset=App.getSelectedPreset?.(),api={type:preset?.provider||'custom',protocol:preset?.protocol||'openai',model:document.getElementById('model-id')?.value.trim(),baseUrl:document.getElementById('base-url')?.value.trim(),key:document.getElementById('api-key')?.value.trim()};
    const message=document.getElementById('aw-message');if(!api.key||!api.model||!api.baseUrl){message.textContent='請先在第 4 步設定自己的 API，再返回此處生成；也可以直接貼入純文字。';return;}
    const key=name==='world'?'worldText':name==='persona'?'personaText':name,input=document.getElementById('aw-'+key);
    const request=name==='world'?'請建立可編輯的完整純文字世界觀與背景，列出融合規則、衝突待確認事項。':name==='npcs'?'請依世界觀建立多位自主 NPC 的純文字人物資料、彼此關係、各自目標與知識界線。':'請依世界觀提供可編輯的玩家角色個人資料草案，不要替玩家決定最終人設。';
    btn.disabled=true;message.textContent='正在使用你的 API 生成草稿……';
    try {const result=await API.send(api,[{role:'system',content:'你是世界設定草稿助手。只輸出純文字草稿，不要開始角色扮演，不要輸出 HTML。參考作品名稱不代表已獲得原作全文；不確定的設定應標明待核對。'},{role:'user',content:[request,'世界類型：'+draft.world,'玩法：'+draft.mode,'參考作品：'+draft.references,'風格：'+draft.tone,'現有世界觀：'+draft.worldText,'現有 NPC：'+draft.npcs,'現有玩家資料：'+draft.personaText].join('\n')}]);input.value=result.text||'';draft[key]=input.value;draft.confirmed[name]=false;saveDraft();document.getElementById('aw-'+name+'-status').textContent='草稿已生成；請檢查、修改後按「記住」';message.textContent='生成完成。草稿尚未記住，請先確認。';}
    catch(err){message.textContent='生成失敗：'+(err.message||'請檢查 API 設定');}finally{btn.disabled=false;}
  }
  App.openBuilder=function(){originalOpen();if(this.activeCharacter?.id!==ID)return;draft=loadDraft();render();};
  App.collectConfig=function(){
    if(this.activeCharacter?.id!==ID)return originalCollect();
    // The legacy character collector expects npc-world-* controls that the world workbench replaces.
    // Temporarily hide only the world section from that collector; leave single-character behavior untouched.
    const section=document.getElementById('autonomous-world-setup');
    const previousId=section?.id;
    if(section)section.removeAttribute('id');
    let cfg;
    try{cfg=originalCollect();}finally{if(section)section.id=previousId;}
    if(!section)return cfg;
    for(const key of ['mode','world','references','tone','worldText','npcs','personaText','opening'])draft[key]=text(key);
    saveDraft();cfg.worldSetup=JSON.parse(JSON.stringify(draft));cfg.narrativeMode=draft.mode==='immersive'?'immersive':'world';return cfg;
  };
  App.buildSystemPrompt=function(){const base=originalPrompt(),s=this.config?.worldSetup;if(this.activeCharacter?.id!==ID||!s)return base;const confirmed=s.confirmed||{};return base+'\n\n【玩家確認的開局設定；優先於角色卡預設開場】\n玩法：'+s.mode+'\n世界類型：'+s.world+'\n風格：'+(s.tone||'未指定')+'\n參考方向（不保證原作準確）：'+(s.references||'無')+'\n'+(confirmed.world?'【已確認世界觀】\n'+s.worldText+'\n':'')+(confirmed.npcs?'【已確認 NPC】\n'+s.npcs+'\n':'')+(confirmed.persona?'【已確認玩家資料】\n'+s.personaText+'\n':'')+'【第一幕】'+(s.opening||'依已確認設定自然展開')+'\n不要重播角色卡的舊開場白，不要再次要求選擇顯示模式或世界觀。未確認的草稿不得當成既定事實。';};
  App.renderChatShell=function(fresh=false){originalShell(fresh);if(!fresh||this.activeCharacter?.id!==ID||Chat.messages.length)return;const stream=document.getElementById('chat-stream');if(stream)stream.innerHTML='<div class="message assistant"><div class="bubble">世界設定已就緒。輸入第一個行動，即可依已確認的世界觀展開故事。</div></div>';};
  App.resumeSavedStory=function(){originalResume();if(this.activeCharacter?.id!==ID)return;/* The saved story config, not the global draft, remains the source of truth on resume. */};
})();