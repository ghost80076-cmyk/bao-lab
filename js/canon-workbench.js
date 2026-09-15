(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || typeof API === "undefined") return;

  const categories = { relationships:"人物與關係", knowledge:"角色知情矩陣", timeline:"事件時間線", world:"世界觀與勢力", threads:"伏筆與未完成事項", current:"當前狀態", conflicts:"存疑與衝突" };
  const tierLabels = { core:"Core", relevant:"Relevant", ui:"UI Only" };
  const esc = value => App.escapeHTML(String(value ?? ""));
  const attr = value => App.escapeAttr(String(value ?? ""));
  const currentState = () => window.GameState?.current || null;
  const normalizeNotebook = (book = {}, index = 0) => ({
    id:String(book.id || `canon-${Date.now()}-${index}`), title:String(book.title || categories[book.category] || `Canon ${index + 1}`).slice(0,80),
    category:categories[book.category] ? book.category : "current", tier:["core","relevant","ui"].includes(book.tier) ? book.tier : (book.category === "world" ? "core" : book.category === "conflicts" ? "ui" : "relevant"),
    certainty:["confirmed","mixed","uncertain"].includes(book.certainty) ? book.certainty : "mixed", enabled:book.enabled !== false,
    content:String(book.content || "").slice(0,30000), evidence:String(book.evidence || "").slice(0,10000)
  });
  const normalizeCanon = input => {
    const raw = input && typeof input === "object" ? input : {};
    return { version:1, confirmedAt:String(raw.confirmedAt || ""), lastProcessedMessageCount:Math.max(0,Number(raw.lastProcessedMessageCount || 0)), notebooks:(Array.isArray(raw.notebooks) ? raw.notebooks : []).map(normalizeNotebook) };
  };
  const confirmed = () => normalizeCanon(currentState()?.canon || {});
  const draft = () => currentState()?.canonDraft ? normalizeCanon(currentState().canonDraft) : null;
  const saveDraft = value => { if (currentState()) { currentState().canonDraft = normalizeCanon(value); App.saveStory?.(false); } };
  const estimateTokens = text => window.BAOStoryTools?.tokenEstimate?.(text) || Math.ceil(String(text || "").length / 3);
  const messageText = (message,index) => `[訊息 ${index + 1}] ${message.role === "user" ? "玩家" : "AI角色"}：${String(message.content || "")}`;
  const chunkMessages = (messages,startIndex,maxTokens=9000) => {
    const chunks=[]; let lines=[],tokens=0;
    messages.forEach((message,offset) => { const line=messageText(message,startIndex+offset),cost=estimateTokens(line)+8; if(lines.length&&tokens+cost>maxTokens){chunks.push(lines.join("\n\n"));lines=[];tokens=0;} lines.push(line);tokens+=cost; });
    if(lines.length)chunks.push(lines.join("\n\n")); return chunks;
  };
  const parseJSON = text => {
    const clean=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
    try{return JSON.parse(clean);}catch{const first=clean.indexOf("{"),last=clean.lastIndexOf("}");if(first<0||last<=first)throw new Error("模型沒有回傳可解析的 Canon JSON。");return JSON.parse(clean.slice(first,last+1));}
  };
  const schema='{"notebooks":[{"title":"","category":"relationships|knowledge|timeline|world|threads|current|conflicts","tier":"core|relevant|ui","certainty":"confirmed|mixed|uncertain","content":"條目化內容","evidence":"訊息編號"}]}';
  const extractPrompt=(chunk,part,total)=>[
    "你是劇情 Canon 證據提取器，不是故事作者。只根據下方原始對話提取事實，不得續寫或補全。",
    "既有 AI 台詞可能只是角色觀點，不等於客觀世界真相。人物心理只有原文明確表現時才能列為確定。",
    "整理人物關係變化、角色知情差異、時間線與因果、世界觀與勢力、伏筆承諾衝突、最新狀態。每項關鍵結論保留訊息編號；無法確認的內容標示存疑或推論。",
    `這是第 ${part}/${total} 段，只能聲稱整理本段。`,`只輸出合法 JSON，格式：${schema}`,`【原始對話】\n${chunk}`
  ].join("\n\n");
  const mergePrompt=(fragments,prior,mode,totalMessages)=>[
    "你是劇情 Canon 校驗器，不是故事作者。將多段證據合併、去重、校正時間順序與人物知情邊界。",
    "原始對話提取結果優先；既有 Canon 只能作為檢索線索。若衝突，以有較晚原始訊息證據者為準；無法解決就放入 conflicts，不得自行選答案。",
    "過期狀態保留在時間線；current 只保留最新狀態。不要永久推斷玩家心理、喜惡或未說出口的決定。",
    "按內容拆成多份記事本；world 硬規則可使用 core，通常記事使用 relevant，衝突與純證據資料使用 ui。",
    `本次模式：${mode==="full"?"完整重建":"增量更新"}；處理後訊息數為 ${totalMessages}。`,`只輸出合法 JSON，格式：${schema}`,
    prior.notebooks.length?`【既有 Canon（僅供比對）】\n${JSON.stringify(prior.notebooks)}`:"",`【分段提取結果】\n${JSON.stringify(fragments)}`
  ].filter(Boolean).join("\n\n");
  const request=async(prompt,maxOutputTokens=2200)=>API.send({...App.config.api,__memoryTask:true,maxOutputTokens},[{role:"system",content:"只進行劇情 Canon 整理與校驗，只輸出合法 JSON。"},{role:"user",content:prompt}]);
  const run=async(mode,onProgress=()=>{})=>{
    if(App.config?.demoMode||!App.config?.api?.key)throw new Error("請先連接玩家自己的 API；本機預覽不會偽裝成 AI Canon 整理。");
    const all=Chat.messages||[],prior=confirmed(),start=mode==="full"?0:Math.min(prior.lastProcessedMessageCount,all.length),selected=all.slice(start);
    if(!selected.length)throw new Error(mode==="full"?"目前沒有可整理的對話。":"上次確認後沒有新增對話。");
    const chunks=chunkMessages(selected,start),fragments=[];
    for(let index=0;index<chunks.length;index+=1){onProgress(`提取證據 ${index+1}/${chunks.length}`,index,chunks.length+1);const result=await request(extractPrompt(chunks[index],index+1,chunks.length));fragments.push(parseJSON(result?.text||""));}
    onProgress("合併與一致性校驗",chunks.length,chunks.length+1);const result=await request(mergePrompt(fragments,prior,mode,all.length),3200),merged=parseJSON(result?.text||"");
    const next=normalizeCanon({notebooks:merged.notebooks,lastProcessedMessageCount:all.length});saveDraft(next);onProgress("草稿完成，等待玩家確認",chunks.length+1,chunks.length+1);return next;
  };
  const estimate=mode=>{const prior=confirmed(),all=Chat.messages||[],start=mode==="full"?0:Math.min(prior.lastProcessedMessageCount,all.length),chunks=chunkMessages(all.slice(start),start);return{messages:all.length-start,chunks:chunks.length,calls:chunks.length?chunks.length+1:0,tokens:chunks.reduce((sum,item)=>sum+estimateTokens(item),0)};};
  const bookHTML=(book,editable)=>`<article class="canon-book" data-canon-book="${attr(book.id)}"><div class="canon-book-head"><input type="checkbox" data-canon-enabled ${book.enabled?"checked":""} ${editable?"":"disabled"}><input type="text" data-canon-title value="${attr(book.title)}" maxlength="80" ${editable?"":"readonly"}><button type="button" data-canon-delete ${editable?"":"hidden"}>刪除</button></div><div class="canon-book-controls"><label>分類<select data-canon-category ${editable?"":"disabled"}>${Object.entries(categories).map(([key,label])=>`<option value="${key}" ${book.category===key?"selected":""}>${label}</option>`).join("")}</select></label><label>載入層級<select data-canon-tier ${editable?"":"disabled"}>${Object.entries(tierLabels).map(([key,label])=>`<option value="${key}" ${book.tier===key?"selected":""}>${label}</option>`).join("")}</select></label><label>可信度<select data-canon-certainty ${editable?"":"disabled"}><option value="confirmed" ${book.certainty==="confirmed"?"selected":""}>確定</option><option value="mixed" ${book.certainty==="mixed"?"selected":""}>混合</option><option value="uncertain" ${book.certainty==="uncertain"?"selected":""}>存疑</option></select></label></div><textarea data-canon-content maxlength="30000" ${editable?"":"readonly"}>${esc(book.content)}</textarea><details><summary>證據與來源</summary><textarea data-canon-evidence maxlength="10000" ${editable?"":"readonly"}>${esc(book.evidence)}</textarea></details></article>`;
  const readEditor=area=>normalizeCanon({notebooks:[...area.querySelectorAll("[data-canon-book]")].map((node,index)=>normalizeNotebook({id:node.dataset.canonBook,enabled:node.querySelector("[data-canon-enabled]")?.checked,title:node.querySelector("[data-canon-title]")?.value,category:node.querySelector("[data-canon-category]")?.value,tier:node.querySelector("[data-canon-tier]")?.value,certainty:node.querySelector("[data-canon-certainty]")?.value,content:node.querySelector("[data-canon-content]")?.value,evidence:node.querySelector("[data-canon-evidence]")?.value},index)),lastProcessedMessageCount:Chat.messages.length});
  const html=()=>{const activeDraft=draft(),canon=confirmed(),shown=activeDraft||canon,editable=Boolean(activeDraft),recent=estimate("incremental"),full=estimate("full");return`<div class="canon-summary"><div><span>正式 Canon</span><b>${canon.notebooks.length} 冊</b><small>${canon.confirmedAt?`確認於 ${new Date(canon.confirmedAt).toLocaleString("zh-TW")}`:"尚未建立"}</small></div><div><span>待整理</span><b>${recent.messages} 則</b><small>從上次玩家確認後計算</small></div><div><span>目前畫面</span><b>${editable?"草稿":"正式版"}</b><small>${editable?"尚未送入聊天":"已確認內容可供檢索"}</small></div></div><div class="canon-actions"><button class="secondary" type="button" data-canon-incremental>更新近期 Canon<small>${recent.calls} 次呼叫 · 約 ${recent.tokens.toLocaleString()} input tok</small></button><button class="secondary" type="button" data-canon-full>完整重建 Canon<small>${full.calls} 次呼叫 · 約 ${full.tokens.toLocaleString()} input tok</small></button>${editable?'<button class="secondary" type="button" data-canon-discard>放棄草稿</button><button class="primary" type="button" data-canon-confirm>確認並套用</button>':""}</div><div class="canon-progress" data-canon-progress></div><div class="canon-notice">AI 只產生草稿。玩家確認前不會寫入正式 Canon；原始聊天紀錄不會被修改。</div><div class="canon-books">${shown.notebooks.length?shown.notebooks.map(book=>bookHTML(book,editable)).join(""):'<div class="memory-empty">尚未建立 Canon。可先使用「更新近期」或「完整重建」。</div>'}</div>`;};
  const mount=root=>{const area=root.querySelector("#canon-workbench-area");if(!area)return;area.innerHTML=html();let running=false;const progress=area.querySelector("[data-canon-progress]");const execute=async mode=>{if(running)return;const info=estimate(mode);if(!info.messages){progress.textContent=mode==="full"?"目前沒有可整理的對話。":"上次確認後沒有新增對話。";return;}const label=mode==="full"?"完整重建":"更新近期";if(!confirm(`${label}會處理 ${info.messages} 則訊息，預計 ${info.calls} 次 API 呼叫。實際費用由你的服務商計算。要繼續嗎？`))return;running=true;area.querySelectorAll("button").forEach(button=>button.disabled=true);try{await run(mode,(label,done,total)=>{progress.textContent=`${label} · ${done}/${total}`;});window.BAOMemoryWorkbench.refresh(root,"canon");}catch(error){progress.textContent=`Canon 整理失敗：${String(error.message||error).split("\n")[0]}`;area.querySelectorAll("button").forEach(button=>button.disabled=false);}finally{running=false;}};area.querySelector("[data-canon-incremental]")?.addEventListener("click",()=>execute("incremental"));area.querySelector("[data-canon-full]")?.addEventListener("click",()=>execute("full"));area.querySelector("[data-canon-discard]")?.addEventListener("click",()=>{if(currentState())delete currentState().canonDraft;App.saveStory?.(false);window.BAOMemoryWorkbench.refresh(root,"canon");});area.querySelector("[data-canon-confirm]")?.addEventListener("click",()=>{if(!currentState())return;const next=readEditor(area);next.confirmedAt=new Date().toISOString();next.lastProcessedMessageCount=Chat.messages.length;currentState().canon=next;delete currentState().canonDraft;App.saveStory?.(false);window.BAOMemoryWorkbench.refresh(root,"canon");});area.querySelectorAll("[data-canon-delete]").forEach(button=>button.addEventListener("click",()=>{button.closest("[data-canon-book]")?.remove();saveDraft(readEditor(area));}));area.querySelectorAll("[data-canon-book] input,[data-canon-book] select,[data-canon-book] textarea").forEach(field=>field.addEventListener("change",()=>saveDraft(readEditor(area))));};
  const searchTerms=input=>{const text=String(input||"").toLowerCase(),terms=text.match(/[a-z0-9_]{2,}/g)||[];for(const run of text.match(/[\u3400-\u9fff]{2,}/g)||[])for(let i=0;i<run.length-1;i+=1)terms.push(run.slice(i,i+2));return[...new Set(terms)];};
  const relevantBooks=(canon,input)=>{const words=searchTerms(input);return canon.notebooks.filter(book=>book.enabled&&book.tier==="relevant").map(book=>({book,score:words.reduce((score,word)=>score+(`${book.title}\n${book.content}`.toLowerCase().includes(word)?1:0),0)+(book.category==="current"?1:0)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(item=>item.book);};
  const latestUser=()=>{for(let i=Chat.messages.length-1;i>=0;i-=1)if(Chat.messages[i]?.role==="user")return String(Chat.messages[i].content||"");return"";};
  const originalBuild=App.buildSystemPrompt.bind(App);App.buildSystemPrompt=function(){const base=originalBuild(),canon=confirmed(),core=canon.notebooks.filter(book=>book.enabled&&book.tier==="core"),relevant=relevantBooks(canon,latestUser()),block=books=>books.map(book=>`〔${book.title}｜${categories[book.category]}｜${book.certainty}〕\n${book.content}`).join("\n\n");return[base,core.length?`【Canon Core · 玩家已確認】\n${block(core)}`:"",relevant.length?`【本輪相關 Canon】\n${block(relevant)}`:""].filter(Boolean).join("\n\n");};
  window.BAOCanonWorkbench={mount,run,estimate,normalizeCanon,relevantBooks,searchTerms,chunkMessages,parseJSON};
  document.querySelectorAll(".memory-desk-backdrop").forEach(mount);
})();
