/* Yume archive: read-only UI over the active story and shared GameState; no extra prompts, API calls or storage. */
(function (root, make) {
  'use strict';
  const api = make();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOYumeArchiveCore = api;
  if (!root?.document || !root.App || !root.Chat) return;

  const doc = root.document;
  const roster = api.roster;
  const CHAT_ID = 'bao-yume-archive';
  const yumePhotos = Object.freeze([
    {src:'assets/yume-yume-close-v3.webp',label:'近距離',alt:'黑羽ゆめ的近距離肖像'},
    {src:'assets/yume-yume-home-v3.webp',label:'中野套房',alt:'黑羽ゆめ在中野套房的肖像'},
    {src:'assets/yume-yume-club-v3.webp',label:'Club Rose',alt:'黑羽ゆめ在夜店的肖像'}
  ]);
  let currentStory = null;
  let focused = 'yume';
  let yumePhoto = 1;
  let tab = 'scene';
  let open = false;
  let queued = false;
  const el = (tag, cls, value) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  };
  const eligible = () => api.isYume(root.App.activeCharacter);
  const isChat = () => Boolean(doc.getElementById('chat-view')?.classList.contains('active'));
  const ownerState = () => root.GameState?.current || null;
  function style() {
    if (doc.getElementById('bao-yume-archive-style')) return;
    const css = el('style'); css.id = 'bao-yume-archive-style';
    css.textContent = `
#bao-yume-archive{max-width:100%;margin:10px 0 14px;flex-shrink:0;color:#f9e5f2;background:#19151f;border:1px solid #79526b;border-radius:14px;overflow:hidden;font:inherit}
#bao-yume-archive *{box-sizing:border-box}#bao-yume-archive button{font:inherit;cursor:pointer}
#bao-yume-archive .y-head{width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#2c2031;color:#ffe2f0;border:0;text-align:left}
#bao-yume-archive .y-panel{padding:12px;display:grid;gap:12px}#bao-yume-archive .y-tabs{display:flex;flex-wrap:wrap;gap:7px}
#bao-yume-archive .y-people{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#bao-yume-archive .y-person{display:grid;gap:5px;padding:5px;min-width:0;border:1px solid #77546c;border-radius:10px;background:#33253a;color:#f7ddea;text-align:center}
#bao-yume-archive .y-person[aria-pressed=true]{background:#784365;border-color:#e8a4c8;color:white;box-shadow:0 0 0 2px #e8a4c83b}
#bao-yume-archive .y-person img{width:100%;height:105px;object-fit:cover;object-position:center 23%;border-radius:6px;display:block}
#bao-yume-archive .y-person span{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#bao-yume-archive .y-player{justify-self:start}
#bao-yume-archive .y-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:360px;width:100%;margin:auto}
#bao-yume-archive .y-gallery button{display:grid;gap:4px;padding:5px;border:1px solid #77546c;border-radius:9px;background:#33253a;color:#f7ddea;cursor:pointer}
#bao-yume-archive .y-gallery button[aria-pressed=true]{border-color:#ffc2e0;background:#784365}
#bao-yume-archive .y-gallery img{display:block;width:100%;height:72px;object-fit:cover;object-position:center 20%;border-radius:5px}
#bao-yume-archive .y-gallery span{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#bao-yume-archive .y-chip{border:1px solid #77546c;border-radius:999px;background:#33253a;color:#f7ddea;padding:6px 10px;min-height:34px}
#bao-yume-archive .y-chip[aria-pressed=true]{background:#784365;border-color:#e8a4c8;color:white}
#bao-yume-archive .y-network{width:100%;max-width:390px;display:block;margin:0 auto;overflow:visible}
#bao-yume-archive .y-item{background:#29212f;padding:10px;border:1px solid #554359;border-radius:10px;overflow-wrap:anywhere}
#bao-yume-archive .y-item strong{display:block;color:#f9b8d7;margin-bottom:5px}
#bao-yume-archive .y-item small,#bao-yume-archive .y-muted{display:block;color:#c4b3c3;font-size:12px;line-height:1.55}
#bao-yume-archive .y-item p{margin:6px 0 0;white-space:pre-wrap;line-height:1.6;font-size:14px}
#bao-yume-archive .y-portrait{display:block;width:auto;max-width:min(100%,320px);max-height:480px;height:auto;object-fit:contain;border:1px solid #79526b;border-radius:12px;margin:0 auto}
#bao-yume-archive .y-note{font-size:12px;color:#c6aec1;line-height:1.6}
@media(min-width:680px){#bao-yume-archive .y-people{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media(max-width:480px){#bao-yume-archive .y-panel{padding:10px}#bao-yume-archive .y-network{max-width:280px}}
`;
    doc.head.appendChild(css);
  }
  function button(text, onClick, pressed) {
    const b = el('button', 'y-chip', text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(Boolean(pressed)));
    b.addEventListener('click', onClick);
    return b;
  }
  function drawGraph(svg, data) {
    const NS = 'http://www.w3.org/2000/svg';
    const nodes = {player:[156,14], yume:[156,90], rina:[42,160], ryusei:[270,160], airi:[42,252], asami:[156,252], misaki:[270,252]};
    svg.setAttribute('viewBox', '0 0 312 296');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label','已標記的人物關係連線圖');
    const relevant = data.relations.filter(r => r.a === focused || r.b === focused);
    const pairs = new Set(relevant.map(r => [r.a,r.b].sort().join('|')));
    pairs.forEach(key => {
      const [a,b] = key.split('|'); const na = nodes[a], nb = nodes[b];
      if (!na || !nb) return;
      const line = doc.createElementNS(NS, 'line');
      line.setAttribute('x1',na[0]); line.setAttribute('y1',na[1]);
      line.setAttribute('x2',nb[0]); line.setAttribute('y2',nb[1]);
      line.setAttribute('stroke','#e9a0c5'); line.setAttribute('stroke-width','2');
      svg.appendChild(line);
    });
    Object.entries(nodes).forEach(([id, point]) => {
      const circle = doc.createElementNS(NS, 'circle');
      circle.setAttribute('cx',point[0]);circle.setAttribute('cy',point[1]);circle.setAttribute('r',id===focused?'28':'25');
      circle.setAttribute('fill',id===focused?'#6f3d5a':'#30243b');
      circle.setAttribute('stroke',id===focused?'#ffc2e0':'#8b6985');circle.setAttribute('stroke-width','2');
      svg.appendChild(circle);
      const label = doc.createElementNS(NS, 'text');
      label.setAttribute('x',point[0]);label.setAttribute('y',point[1]+4);label.setAttribute('text-anchor','middle');
      label.setAttribute('font-size','12');label.setAttribute('fill','#fff0f8');
      label.textContent=roster[id] || id; svg.appendChild(label);
    });
  }
  function render() {
    queued = false;
    const old = doc.getElementById(CHAT_ID);
    if (!eligible() || !isChat() || !ownerState()) { old?.remove(); currentStory=null; return; }
    const story = ownerState();
    if (story !== currentStory) {currentStory=story;focused='yume';yumePhoto=1;tab='scene';open=false;}
    const main = doc.querySelector('#chat-view .chat-main');
    const stream = doc.getElementById('chat-stream');
    if (!main || !stream) return;
    if (!stream.dataset.baoYumeObserved && root.MutationObserver) {
      stream.dataset.baoYumeObserved = '1';
      new root.MutationObserver(() => { if (open) schedule(); }).observe(stream, {childList:true,subtree:true});
    }
    style();
    let container = old;
    if (!container) {
      container=el('section'); container.id=CHAT_ID;
      main.insertBefore(container, stream);
    }
    const data=api.collect(root.Chat.messages);
    container.replaceChildren();
    const head=el('button','y-head',`♡ 人物關係・親密紀錄・世界進展　${open?'▴':'▾'}`);
    head.type='button';head.setAttribute('aria-expanded',String(open));
    head.addEventListener('click',()=>{open=!open;schedule();});
    container.appendChild(head);
    if (!open) return;
    const panel=el('div','y-panel');
    const tabs=el('div','y-tabs');
    for (const [id,label] of [['scene','街區・現場'],['cast','人物圖鑑'],['relations','關係網絡'],['phone','LINE・來電'],['sns','SNS'],['intimacy','R18 檔案']]) {
      tabs.append(button(label,()=>{tab=id;schedule();},tab===id));
    }
    panel.appendChild(tabs);
    const playerButton=button('玩家視角',()=>{focused='player';schedule();},focused==='player');
    playerButton.classList.add('y-player');panel.append(playerButton);
    const persons=el('div','y-people');
    for (const [id,name] of Object.entries(roster)) {
      if (id==='player') continue;
      const person=el('button','y-person');
      person.type='button';person.setAttribute('aria-pressed',String(focused===id));
      person.setAttribute('aria-label',`查看${name}的角色檔案`);
      const thumb=el('img');thumb.src=id==='yume'?yumePhotos[0].src:`assets/yume-${id}-v2.webp`;
      thumb.alt='';thumb.loading='lazy';thumb.width=90;thumb.height=105;
      person.append(thumb,el('span','',name));
      person.addEventListener('click',()=>{focused=id;schedule();});
      persons.append(person);
    }
    panel.appendChild(persons);
    panel.append(el('div','y-muted',`目前選擇：${roster[focused]}`));
    if (focused !== 'player') {
      const portrait=el('img','y-portrait');
      portrait.src=focused==='yume'?yumePhotos[yumePhoto].src:`assets/yume-${focused}-v2.webp`;
      portrait.alt=focused==='yume'?yumePhotos[yumePhoto].alt:`${roster[focused]}的人物插畫`;
      portrait.loading='lazy';
      panel.append(portrait);
      if(focused==='yume') {
        const gallery=el('div','y-gallery');gallery.setAttribute('aria-label','黑羽ゆめ圖片');
        yumePhotos.forEach((photo,index)=>{
          const choice=el('button');choice.type='button';
          choice.setAttribute('aria-pressed',String(yumePhoto===index));
          choice.setAttribute('aria-label',`查看黑羽ゆめ：${photo.label}`);
          const preview=el('img');preview.src=photo.src;preview.alt='';preview.loading='lazy';
          choice.append(preview,el('span','',photo.label));
          choice.addEventListener('click',()=>{yumePhoto=index;schedule();});
          gallery.append(choice);
        });
        panel.append(gallery);
      }
      const npc=api.knownNPC(story,focused);
      const state=el('div','y-item');
      state.append(el('strong','',`${roster[focused]} · 共用世界狀態`));
      state.append(el('small','',npc ? `在場狀態：${api.presenceLabel(npc.presence)}${npc.presence === 'present' && api.known(npc.location) ? ` · 目前位置：${String(npc.location).slice(0,100)}` : ''}` : '尚未找到這名 NPC 的已確認狀態；不會猜測行蹤。'));
      panel.append(state);
    }
    if (tab==='relations') { const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('y-network');drawGraph(svg,data);panel.appendChild(svg); }
    let visible=[];
    if (tab==='scene') {
      const position=el('div','y-item');
      position.append(el('strong','','目前世界位置'));
      position.append(el('p','',`${api.known(story.time)?story.time:'時間未確認'} · ${api.known(story.location)?story.location:'地點未確認'}`));
      panel.append(position);
      visible=[...data.scenes.slice(-1),...data.offscreen.filter(r=>r.actor===focused)];
    } else if (tab==='cast') {
      const profile=root.App.activeCharacter?.profile?.cast?.find?.(p=>p.id===focused);
      if (profile) panel.append(el('div','y-item',`${profile.name} · ${profile.age}歲 · ${profile.job}`));
      visible=data.characters.filter(r=>r.actor===focused);
    } else if (tab==='phone') visible=data.phones.filter(r=>r.actor===focused);
    else if (tab==='sns') visible=data.sns.filter(r=>r.actor===focused);
    else visible=data[tab].filter(r=>r.a===focused || r.b===focused);
    if (!visible.length) panel.append(el('div','y-item',({scene:'尚無這名角色已公開的場外紀錄；請看原生事件面板。',cast:'這條故事尚無玩家可見的角色新資料。',relations:'尚無明確標記的人物關係。',phone:'玩家的手機尚無這名角色可見的訊息或來電。',sns:'尚無玩家可見的貼文；私密帳號不會自動解鎖。',intimacy:'尚無明確標記的親密事件；不會由曖昧推定。'})[tab]));
    visible.slice(-60).reverse().forEach(record=>{
      const card=el('article','y-item');
      const label=tab==='scene'?(record.actor?`${roster[record.actor]} · 已公開場外紀錄`:'最近的現場'):
        tab==='cast'?`${roster[record.actor]} · 已知動態`:
        tab==='phone'?`${roster[record.actor]} · ${record.kind==='CALL'?'來電':'LINE'}`:
        tab==='sns'?`${roster[record.actor]} · ${record.scope==='PRIVATE'?'已標記可見的裏帳':'公開貼文'}`:`${roster[record.a]} × ${roster[record.b]}`;
      card.append(el('strong','',label));
      card.append(el('small','',`故事訊息 ${record.turn} · 玩家可見資料`));
      card.append(el('p','',record.body));panel.append(card);
    });
    panel.append(el('div','y-note','唯讀呈現目前故事的玩家可見標記與共用世界狀態。介面不發送 API，也不保存第二份世界；沒有標記時請看原生敘事與狀態面板。回溯／分支時依目前對話重建。'));
    container.append(panel);
  }
  function schedule() { if(queued)return;queued=true;root.queueMicrotask ? root.queueMicrotask(render) : Promise.resolve().then(render); }
  const originalAdd=root.Chat.add.bind(root.Chat);
  root.Chat.add=function(...args){const msg=originalAdd(...args);if(args[0]==='assistant' && open)schedule();return msg;};
  const originalShell=root.App.renderChatShell.bind(root.App);
  root.App.renderChatShell=function(...args){const result=originalShell(...args);schedule();return result;};
  const originalShow=root.App.showView.bind(root.App);
  root.App.showView=function(...args){const result=originalShow(...args);schedule();return result;};
  const originalPanel=root.App.renderUIPanel?.bind(root.App);
  if (originalPanel) root.App.renderUIPanel=function(...args){const result=originalPanel(...args);if(open)schedule();return result;};
  root.BAOYumeArchive=Object.freeze({refresh:schedule,collect:()=>api.collect(root.Chat.messages)});
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',schedule);
  else schedule();
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const roster=Object.freeze({player:'玩家',yume:'ゆめ',rina:'りな',ryusei:'琉星',airi:'あいり',asami:'麻美',misaki:'美咲'});
  const aliases=Object.freeze({yume:['黑羽ゆめ','黒羽ゆめ','ゆめ'],rina:['桜井りな','りな'],ryusei:['琉星'],airi:['あいり'],asami:['高橋麻美','麻美'],misaki:['田中美咲','美咲']});
  const normalized=value=>String(value||'').normalize('NFKC').replace(/[\s・·]/g,'').toLowerCase();
  const known=value=>Boolean(String(value??'').trim()) && !/^(?:未知|未設定|未確認|—|－|-|null)$/i.test(String(value).trim());
  const isYume=card=>{const name=String(card?.name||'');return /(黑羽|黒羽)/.test(name)&&/(ゆめ|夢)/.test(name);};
  const presenceLabel=value=>({present:'在場',away:'已離場',unknown:'行蹤未知'})[value]||'尚未確認';
  function knownNPC(state,id) {
    if(!Object.hasOwn(aliases,id))return null;
    return (Array.isArray(state?.npcs)?state.npcs:[]).find(npc=>aliases[id].some(name=>normalized(name)===normalized(npc?.name)))||null;
  }
  function collect(messages) {
    const result={relations:[],intimacy:[],offscreen:[],scenes:[],characters:[],phones:[],sns:[]};
    const pair=/\[(REL|INTIMACY):([a-z][a-z0-9_-]{0,39})\|([a-z][a-z0-9_-]{0,39})\]([\s\S]{1,2000}?)\[\/\1\]/gi;
    const offscreen=/\[OFFSCREEN:([a-z][a-z0-9_-]{0,39})(?:\|known)?\]([\s\S]{1,2000}?)\[\/OFFSCREEN\]/gi;
    const scene=/\[SCENE\]([\s\S]{1,3000}?)\[\/SCENE\]/gi;
    const character=/\[CHAR:([a-z][a-z0-9_-]{0,39})\]([\s\S]{1,2000}?)\[\/CHAR\]/gi;
    const phone=/\[(PHONE|CALL):([a-z][a-z0-9_-]{0,39})\]([\s\S]{1,2000}?)\[\/\1\]/gi;
    const sns=/\[SNS:(PUBLIC|PRIVATE):([a-z][a-z0-9_-]{0,39})\]([\s\S]{1,2000}?)\[\/SNS\]/gi;
    for (const [i,message] of (Array.isArray(messages)?messages:[]).entries()) {
      if(message?.role!=='assistant')continue;
      const content=String(message.content||'');
      if(!/\[(?:REL|INTIMACY|OFFSCREEN|CHAR|PHONE|CALL|SNS):|\[SCENE\]/i.test(content))continue;
      pair.lastIndex=0;
      for (const match of content.matchAll(pair)) {
        const a=match[2].toLowerCase(),b=match[3].toLowerCase(),body=match[4].trim();
        if(!Object.hasOwn(roster,a)||!Object.hasOwn(roster,b)||a===b||!body)continue;
        result[match[1].toUpperCase()==='REL'?'relations':'intimacy'].push({a,b,body:body.slice(0,1600),turn:i+1,id:`turn-${i}:${match.index}`});
      }
      offscreen.lastIndex=0;
      for (const match of content.matchAll(offscreen)) {
        const actor=match[1].toLowerCase(),body=match[2].trim();
        if(!Object.hasOwn(aliases,actor)||!body)continue;
        result.offscreen.push({actor,body:body.slice(0,1600),turn:i+1,id:`turn-${i}:${match.index}`});
      }
      for (const match of content.matchAll(scene)) {
        const body=match[1].trim();if(body)result.scenes.push({body:body.slice(0,3000),turn:i+1});
      }
      for (const [pattern,key] of [[character,'characters'],[phone,'phones'],[sns,'sns']]) {
        for (const match of content.matchAll(pattern)) {
          const actor=(key==='characters'?match[1]:match[2]).toLowerCase();
          const body=(key==='characters'?match[2]:match[3]).trim();
          if(!Object.hasOwn(aliases,actor)||!body)continue;
          result[key].push({actor,body:body.slice(0,1600),kind:key==='phones'?match[1].toUpperCase():undefined,scope:key==='sns'?match[1].toUpperCase():undefined,turn:i+1});
        }
      }
    }
    return result;
  }
  return Object.freeze({roster,isYume,collect,knownNPC,known,presenceLabel});
});
