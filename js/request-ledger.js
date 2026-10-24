/* Optional, memory-only execution metadata. No prompts, credentials or URLs. */
(() => {
  'use strict';
  if (window.BAORequestLedger || !window.App || !window.Chat || !API.wrapSend) return;
  const runs=new WeakMap(),active=new WeakMap(),bindings=new WeakMap(),tokens=new WeakMap(),identities=new WeakMap();
  const identity=value=>{
    if (!value || typeof value!=='object') return null;
    if (!identities.has(value)) identities.set(value,{});
    return identities.get(value);
  };
  const owner=()=>GameState.current && (window.BAOStoryRevisionState?.contextIdentity?.() || GameState.current);
  // Keep only a bounded source fingerprint, never source text or config refs.
  const digest=messages=>{
    const text=JSON.stringify(messages.map(m=>[m.id,m.role,m.content,m.context_content || '']));
    let a=2166136261,b=5381;
    for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
    return `${messages.length}:${text.length}:${a>>>0}:${b>>>0}`;
  };
  const kinds={story:'故事正文',advisor:'前置解讀',observer:'後置解讀',commentary:'場外人格',memory:'記憶整理',
    'memory-repair':'記憶格式修復',state:'獨立狀態整理','state-rebuild':'狀態重建',inspiration:'行動靈感',
    regenerate:'重新生成',rewrite:'AI 改寫',connection:'連線測試',tool:'故事工具',auxiliary:'其他輔助'};
  const reasons={disabled:'未啟用',empty:'沒有可分析內容','local-preview':'本機預覽，不呼叫模型','not-connected':'連線尚未完成',
    cached:'已有本輪結果，略過重複生成',threshold:'尚未達整理門檻',busy:'同一故事已有整理任務',cooldown:'失敗冷卻中',
    'memory-mode':'目前記憶模式不自動整理','tracking-off':'狀態追蹤未啟用',interval:'尚未達狀態整理間隔',
    merged:'與正文同次生成，不另送狀態請求','story-incomplete':'正文未完成，未進入後續階段',
    'merged-invalid':'正文狀態附錄缺少或無法使用；未補送獨立請求',
    'invalid-output':'回應格式無法使用，未更新記憶',
    'not-reached':'未進入此階段／沒有獨立請求紀錄'};
  const classify=config=>config?.__connectionTest?'connection':config?.__memoryTask?(config.__memoryRepairTask?'memory-repair':'memory'):
    config?.__stateTask?(config.__stateRebuild?'state-rebuild':'state'):config?.__inspirationTask?'inspiration':
    ['advisor','observer'].includes(config?.__interpretationTask)?config.__interpretationTask:config?.__commentaryTask?'commentary':
    config?.__storyTool?(['regenerate','rewrite'].includes(config.__storyRevision)?config.__storyRevision:'tool'):config?.__auxiliaryTask?'auxiliary':'story';
  const matches=run=>{
    const binding=bindings.get(run);
    return binding && binding.owner===owner() && binding.config===identity(App.config) && binding.character===identity(App.activeCharacter)
      && binding.source===digest(Chat.messages.slice(0,binding.length));
  };
  const begin=type=>{
    const key=owner();if(!key)return null;
    const run={type,at:new Date().toISOString(),status:'pending',calls:[],decisions:[],logicalRequests:0,transportAttempts:0,retries:0,truncated:false};
    bindings.set(run,{owner:key,config:identity(App.config),character:identity(App.activeCharacter),source:digest(Chat.messages),length:Chat.messages.length});
    runs.set(key,run);active.set(key,run);return run;
  };
  const finish=(run,status)=>{
    if(!run)return;
    const binding=bindings.get(run);
    if(matches(run)){
      if(binding.revision)binding.revision.message=identity(Chat.messages[binding.revision.index]);
      binding.length=Chat.messages.length;binding.source=digest(Chat.messages);
      run.status=status;
    }else run.status='stale';
    if(active.get(binding.owner)===run)active.delete(binding.owner);
  };
  const decision=(kind,reason)=>{
    if(!kinds[kind] || !reasons[reason])return;
    const run=active.get(owner());if(!run || !matches(run))return;
    if(run.decisions.some(d=>d.kind===kind && d.reason===reason))return;
    if(run.decisions.length<100)run.decisions.push({kind,reason});else run.truncated=true;
  };
  const safely=(fn,fallback=null)=>{try{return fn();}catch(_){return fallback;}};
  const route=config=>config?.local || config?.type==='lmstudio' || config?.route==='local'?'local':
    config?.type==='bao-credits' || config?.route==='bao-credits'?'hosted':
    config?.__memoryTask && App.config?.memory?.summaryApiMode!=='same' && App.config?.memory?.summaryApi?.baseUrl?'separate':
    config?.__stateTask && App.config?.cost?.stateApiMode!=='same' && App.config?.cost?.stateApi?.baseUrl?'separate':'main';
  const transport=(config,event,data={})=>{
    const found=tokens.get(config?.__requestTrace);if(!found)return;
    const {run,call}=found;
    if(event==='attempt'){
      if(['local','hosted'].includes(data.transport))call.route=data.transport;
      call.attemptCount++;run.transportAttempts++;
      if(call.attempts.length===10){call.attempts.shift();run.truncated=true;}
      call.attempts.push({number:call.attemptCount,status:'pending'});
    }else if(event==='retry'){call.retries++;run.retries++;}
    else if(['http','network'].includes(event)){
      const item=call.attempts.at(-1);if(!item)return;
      item.status=event==='http'?'http':data.aborted?'cancelled':'network-failed';
      if(event==='http' && Number.isInteger(data.status))item.httpStatus=data.status;
    }
  };
  const recordResult=(call,result)=>{
    call.usage={};
    for(const key of ['input_tokens','cached_tokens','output_tokens']){
      const value=result?.usage?.[key];if(typeof value==='number' && Number.isFinite(value))call.usage[key]=value;
    }
    const charged=result?.credits?.charged_usd;
    if(typeof charged==='number' && Number.isFinite(charged))call.chargedUsd=charged;
  };
  API.wrapSend('request-ledger:lifecycle',async(next,config,messages,...rest)=>{
    let run=safely(()=>active.get(owner())),standalone=false;
    if(!run){run=safely(()=>begin(classify(config)));standalone=!!run;}
    if(!run)return next(config,messages,...rest);
    const token={},call={kind:classify(config),status:'pending',model:'',route:'unknown',attemptCount:0,retries:0,attempts:[]};
    safely(()=>{
      run.logicalRequests++;
      if(run.calls.length===100){run.calls.shift();run.truncated=true;}
      run.calls.push(call);tokens.set(token,{run,call});
      if(standalone && ['regenerate','rewrite'].includes(call.kind)){
        const index=Chat.messages.findLastIndex(m=>m.role==='assistant');
        if(index>=0)bindings.get(run).revision={index,message:identity(Chat.messages[index]),token:config.__storyRevisionToken,prefix:digest(Chat.messages.slice(0,index))};
      }
    });
    let status='success';
    try{
      const result=await next({...config,__requestTrace:token},messages,...rest);
      safely(()=>{call.status='success';recordResult(call,result);});return result;
    }catch(error){
      status=error?.name==='AbortError' || error?.code==='BAO_ABORTED'?'cancelled':'failed';
      safely(()=>{call.status=status;});throw error;
    }finally{if(standalone)safely(()=>finish(run,status));}
  });
  API.wrapSend('request-ledger:dispatch',(next,config,messages,...rest)=>{
    safely(()=>{const found=tokens.get(config?.__requestTrace);if(found){found.call.model=String(config.model || '').slice(0,120);found.call.route=route(config);}});
    return next(config,messages,...rest);
  });
  const scope=async(type,next,args)=>{
    if(safely(()=>active.has(owner()),false))return next(...args);
    const run=safely(()=>begin(type));let status='success',result;
    try{result=await next(...args);return result;}catch(error){status=error?.name==='AbortError' || error?.code==='BAO_ABORTED'?'cancelled':'failed';throw error;}
    finally{safely(()=>{
      const failed=run?.calls.find(c=>c.kind==='story' && c.status!=='success');
      if(failed){status=failed.status;for(const kind of ['observer','commentary'])if(!run.calls.some(c=>c.kind===kind))decision(kind,'story-incomplete');}
      else if(run?.calls.some(c=>c.kind==='story') && App.storyTurnReceipts && (result?.kind!=='bao:story-turn' || !result.isCurrent()))status='not-committed';
      finish(run,status);
    });}
  };
  App.wrapSendMessage('request-ledger:turn',function(next,...args){
    const raw=String(document.getElementById('user-input')?.value || '').trim();
    if(!raw)return next(...args);
    const type=!raw?'empty':raw.startsWith('【') && raw.endsWith('】')?'command':this.config?.demoMode || this.config?.offlineWorldPreview?'preview':'turn';
    return scope(type,next,args);
  });
  const summarize=Chat.maybeSummarize?.bind(Chat);
  if(summarize)Chat.maybeSummarize=(...args)=>scope('memory',summarize,args);
  const update=window.WorldStateEngine?.update?.bind(WorldStateEngine);
  if(update)WorldStateEngine.update=(...args)=>scope('state',update,args);
  const reset=Chat.reset.bind(Chat);
  Chat.reset=function(...args){safely(()=>{const key=owner();if(key){runs.delete(key);active.delete(key);}});return reset(...args);};
  const commitRevision=(message,token)=>{
    const run=runs.get(owner()),binding=run && bindings.get(run),revision=binding?.revision;
    if(!revision || !token || revision.token!==token || run.status!=='success' || identity(message)!==revision.message || Chat.messages[revision.index]!==message
      || Chat.messages.length!==binding.length || digest(Chat.messages.slice(0,revision.index))!==revision.prefix)return;
    binding.source=digest(Chat.messages);delete binding.revision;
  };
  const snapshot=()=>{const run=runs.get(owner());return run && matches(run)?structuredClone(run):null;};
  const esc=value=>App.escapeHTML(String(value ?? ''));
  const render=()=>{
    const run=snapshot();if(!run)return '<p data-request-ledger-empty>尚無本輪執行紀錄；送出後可查看任務、略過原因與重試。</p>';
    const statuses={pending:'處理中',success:'完成',failed:'失敗',cancelled:'已取消',stale:'來源已變更','not-committed':'請求完成，故事未採用'};
    const routes={main:'主模型連線',separate:'獨立連線',local:'本機模型',hosted:'夜灣燈火',unknown:'尚未進入傳輸層'};
    const type=({turn:'故事回合',command:'本機設定指令',preview:'本機預覽',memory:'記憶整理',state:'狀態整理'})[run.type] || kinds[run.type] || '模型請求';
    const reached=new Set(run.calls.map(c=>c.kind)),decisions=run.decisions.slice();
    if(run.status!=='pending' && run.type==='turn')for(const kind of ['advisor','observer','commentary','memory','state']){
      if(!reached.has(kind) && !decisions.some(d=>d.kind===kind))decisions.push({kind,reason:'not-reached'});
    }
    return `<details class="context-health-advanced" data-request-ledger style="overflow-wrap:anywhere"><summary>本輪執行紀錄 · ${run.logicalRequests} 項請求 · ${run.transportAttempts} 次傳輸嘗試</summary>
      <p>${esc(type)} · ${esc(run.at)} · ${esc(statuses[run.status])} · 重試 ${run.retries} 次</p>
      <p>傳輸嘗試是瀏覽器觀測的次數，不等於模型實際處理次數或帳單；燈火伺服器內部重試不在此處計數。未回報用量或費用時保持未知。</p>
      ${run.calls.map((call,index)=>`<div data-execution-kind="${esc(call.kind)}"><p><b>${index+1}. ${esc(kinds[call.kind])}</b> · ${esc(statuses[call.status])} · ${esc(routes[call.route])}${call.model?' · '+esc(call.model):''}<br>傳輸嘗試 ${call.attemptCount} 次 · 重試 ${call.retries} 次<br>輸入 ${call.usage?.input_tokens ?? '未知'} · 輸出 ${call.usage?.output_tokens ?? '未知'} · 快取 ${call.usage?.cached_tokens ?? '未知'} tok${call.chargedUsd==null?' · 費用未回報':' · 已回報 US$'+esc(call.chargedUsd)}</p>
      ${call.attempts.map(item=>`<p>第 ${item.number} 次：${item.httpStatus?'HTTP '+item.httpStatus:({pending:'等待回應',cancelled:'已取消','network-failed':'網路失敗'})[item.status] || '回應已接收'}</p>`).join('')}</div>`).join('')}
      ${decisions.map(d=>`<p data-execution-decision="${esc(d.kind)}"><b>${esc(kinds[d.kind])}</b> · ${esc(reasons[d.reason])}</p>`).join('')}
      ${run.truncated?'<p>紀錄已達顯示上限；總次數仍持續累計。</p>':''}</details>`;
  };
  window.BAORequestLedger=Object.freeze({decision,transport,snapshot,render,commitRevision});
})();
