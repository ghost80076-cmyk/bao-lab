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
  let currentStory = null;
  let focused = 'yume';
  let tab = 'relations';
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
#bao-yume-archive .y-panel{padding:12px;display:grid;gap:12px}#bao-yume-archive .y-tabs,#bao-yume-archive .y-people{display:flex;flex-wrap:wrap;gap:7px}
#bao-yume-archive .y-chip{border:1px solid #77546c;border-radius:999px;background:#33253a;color:#f7ddea;padding:6px 10px;min-height:34px}
#bao-yume-archive .y-chip[aria-pressed=true]{background:#784365;border-color:#e8a4c8;color:white}
#bao-yume-archive .y-network{width:100%;max-width:390px;display:block;margin:0 auto;overflow:visible}
#bao-yume-archive .y-item{background:#29212f;padding:10px;border:1px solid #554359;border-radius:10px;overflow-wrap:anywhere}
#bao-yume-archive .y-item strong{display:block;color:#f9b8d7;margin-bottom:5px}
#bao-yume-archive .y-item small,#bao-yume-archive .y-muted{display:block;color:#c4b3c3;font-size:12px;line-height:1.55}
#bao-yume-archive .y-item p{margin:6px 0 0;white-space:pre-wrap;line-height:1.6;font-size:14px}
#bao-yume-archive .y-note{font-size:12px;color:#c6aec1;line-height:1.6}
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
    if (story !== currentStory) {currentStory=story;focused='yume';tab='relations';open=false;}
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
    for (const [id,label] of [['relations','關係網絡'],['intimacy','親密事件'],['offscreen','已標記的場外紀錄']]) {
      tabs.append(button(label,()=>{tab=id;schedule();},tab===id));
    }
    panel.appendChild(tabs);
    const persons=el('div','y-people');
    for (const [id,name] of Object.entries(roster)) persons.append(button(name,()=>{focused=id;schedule();},focused===id));
    panel.appendChild(persons);
    panel.append(el('div','y-muted',`目前選擇：${roster[focused]}`));
    if (focused !== 'player') {
      const npc=api.knownNPC(story,focused);
      const state=el('div','y-item');
      state.append(el('strong','',`${roster[focused]} · 共用世界狀態`));
      state.append(el('small','',npc ? `在場狀態：${api.presenceLabel(npc.presence)}${npc.presence === 'present' && api.known(npc.location) ? ` · 目前位置：${String(npc.location).slice(0,100)}` : ''}` : '尚未找到這名 NPC 的已確認狀態；不會猜測行蹤。'));
      panel.append(state);
    }
    const visible=data[tab].filter(r=>tab==='offscreen' ? r.actor===focused : r.a===focused || r.b===focused);
    if(tab==='relations') { const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('y-network');drawGraph(svg,data);panel.appendChild(svg); }
    if (!visible.length) panel.append(el('div','y-item',tab==='offscreen'?'這條故事尚無已標記的場外事件；原生世界事件請到原有狀態面板查看。':tab==='relations'?'尚無明確標記的人物關係。':'尚無明確標記的親密事件；不會由曖昧推定。'));
    visible.slice(-60).reverse().forEach(record=>{
      const card=el('article','y-item');
      card.append(el('strong','',tab==='offscreen'?`${roster[record.actor]} · 場外進展`:`${roster[record.a]} × ${roster[record.b]}`));
      card.append(el('small','',`故事訊息 ${record.turn} · ${tab==='offscreen'?'已公開的離場事件':tab==='relations'?'人物關係標記':'親密事件標記'}`));
      card.append(el('p','',record.body));panel.append(card);
    });
    panel.append(el('div','y-note','唯讀呈現：讀取目前故事中既有的 [REL]、[INTIMACY]、[OFFSCREEN] 標記及 BAO/LAB 原有世界狀態。不會自行要求 AI 產生標記或重複世界規則；沒有標記時請使用原生事件與狀態面板。回溯／分支時按目前對話重建紀錄。'));
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
  const aliases=Object.freeze({yume:['黑羽ゆめ','黒羽ゆめ','ゆめ'],rina:['りな'],ryusei:['琉星'],airi:['あいり'],asami:['麻美'],misaki:['美咲']});
  const normalized=value=>String(value||'').normalize('NFKC').replace(/[\s・·]/g,'').toLowerCase();
  const known=value=>Boolean(String(value??'').trim()) && !/^(?:未知|未設定|未確認|—|－|-|null)$/i.test(String(value).trim());
  const isYume=card=>{const name=String(card?.name||'');return /(黑羽|黒羽)/.test(name)&&/(ゆめ|夢)/.test(name);};
  const presenceLabel=value=>({present:'在場',away:'已離場',unknown:'行蹤未知'})[value]||'尚未確認';
  function knownNPC(state,id) {
    if(!Object.hasOwn(aliases,id))return null;
    return (Array.isArray(state?.npcs)?state.npcs:[]).find(npc=>aliases[id].some(name=>normalized(name)===normalized(npc?.name)))||null;
  }
  function collect(messages) {
    const result={relations:[],intimacy:[],offscreen:[]};
    const pair=/\[(REL|INTIMACY):([a-z][a-z0-9_-]{0,39})\|([a-z][a-z0-9_-]{0,39})\]([\s\S]{1,2000}?)\[\/\1\]/gi;
    const offscreen=/\[OFFSCREEN:([a-z][a-z0-9_-]{0,39})(?:\|known)?\]([\s\S]{1,2000}?)\[\/OFFSCREEN\]/gi;
    for (const [i,message] of (Array.isArray(messages)?messages:[]).entries()) {
      if(message?.role!=='assistant')continue;
      const content=String(message.content||'');
      if(!/\[(?:REL|INTIMACY|OFFSCREEN):/i.test(content))continue;
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
    }
    return result;
  }
  return Object.freeze({roster,isYume,collect,knownNPC,known,presenceLabel});
});