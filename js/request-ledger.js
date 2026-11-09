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
      if(call.attemptCount>0){call.retries++;run.retries++;}
      call.attemptCount++;run.transportAttempts++;
      if(call.attempts.length===10){call.attempts.shift();run.truncated=true;}
      call.attempts.push({number:call.attemptCount,status:'pending'});
    }else if(['http','network'].includes(event)){
      const item=call.attempts.at(-1);if(!item)return;
      item.status=event==='http'?'http':data.aborted?'cancelled':'network-failed';
      if(event==='http' && Number.isInteger(data.status))item.httpStatus=data.status;
    }
  };
  const enumCode=value=>typeof value==='string' && /^[a-z][a-z0-9_]{0,63}$/i.test(value)?value.toUpperCase():null;
  const policy=/^(?:SAFETY|BLOCKLIST|PROHIBITED_CONTENT|SPII|IMAGE_SAFETY|CONTENT_FILTER|RECITATION|IMAGE_PROHIBITED_CONTENT|IMAGE_RECITATION|MODEL_ARMOR|JAILBREAK)$/;
  const cutoff=/^(?:LENGTH|MAX_TOKENS|MAX_OUTPUT_TOKENS|MAX_COMPLETION_TOKENS)$/;
  const providerResult=(call,result,error)=>{
    const data=result || error;
    const finishReason=enumCode(data && Object.hasOwn(data,'candidateFinishReason')?data.candidateFinishReason:data?.finishReason);
    const blockReason=enumCode(data?.blockReason || data?.promptBlockReason);
    const promptBlockReason=blockReason==='BLOCK_REASON_UNSPECIFIED'?null:blockReason;
    const reportedProvider=data?.provider;
    if(['gemini','openrouter','anthropic'].includes(reportedProvider))call.provider=reportedProvider;
    if(call.route==='hosted' && typeof data?.model==='string' && /^[a-z0-9._:/+@-]{1,120}$/i.test(data.model))call.model=data.model.slice(0,120);
    const text=result?.text;
    const empty=typeof text!=='string' || !text.trim() ||
      /^(?:模型沒有回傳內容|Gemini (?:沒有回傳文字內容|未產生(?:文字)?內容（[A-Z0-9_]+）))。$/.test(text.trim());
    let outcome='success';
    if(promptBlockReason || policy.test(finishReason || '') || error?.code==='BAO_PROVIDER_BLOCKED' ||
       data?.providerErrorType==='content_policy_violation')outcome='policy_block';
    else if(data?.providerErrorType==='refusal')outcome='provider_refusal';
    else if(cutoff.test(finishReason || ''))outcome='output_truncated';
    else if(error?.name==='AbortError' || error?.code==='BAO_ABORTED')outcome='cancelled';
    else if(finishReason==='ERROR' || (error && error?.code!=='BAO_PROVIDER_EMPTY'))outcome='api_error';
    else if(empty)outcome='empty_response';
    const safetyRatings=API.safeSafetyRatings(data?.safetyRatings);
    const promptSafetyRatings=API.safeSafetyRatings(data?.promptSafetyRatings);
    const input=data?.usage?.input_tokens;
    call.diagnostic={outcome,finishReason,promptBlockReason,
      observedInputTokens:Number.isSafeInteger(input) && input>=0?input:null,
      ...(safetyRatings.length?{safetyRatings}:{}),
      ...(promptSafetyRatings.length?{promptSafetyRatings}:{})};
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
    const token={},call={kind:classify(config),task:API.requestTask(config),status:'pending',model:'',route:'unknown',attemptCount:0,retries:0,attempts:[]};
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
  API.wrapSend('request-ledger:dispatch',async(next,config,messages,...rest)=>{
    const call=tokens.get(config?.__requestTrace)?.call;
    if(!call)return next(config,messages,...rest);
    safely(()=>{
      call.model=String(config.model || '').slice(0,120);
      call.route=route(config);
      if(call.route==='local')call.provider='lmstudio';
      else if(API.isOpenRouter(config))call.provider='openrouter';
      else if(['gemini','anthropic'].includes(config.protocol))call.provider=config.protocol;
      else call.provider=String(config.type || config.protocol || 'openai').slice(0,48);
    });
    // Observe the transport result before policy and memory wrappers handle it.
    const record=(result,error)=>{
      providerResult(call,result,error);
      if(call.diagnostic.outcome!=='success' && call.diagnostic.observedInputTokens===null && call.attemptCount)
        call.diagnostic.estimatedInputTokens=window.BAOMemoryCore?.tokens?.(messages) ?? null;
    };
    try{
      const result=await next(config,messages,...rest);
      safely(()=>record(result,null));
      return result;
    }catch(error){
      safely(()=>record(null,error));
      throw error;
    }
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
    const run=snapshot();if(!run)return '<p data-request-ledger-empty>送出故事回覆後，這裡會顯示最近一輪的處理狀態。</p>';
    const statuses={pending:'處理中',success:'已完成',failed:'未完成，請檢查連線後重試',cancelled:'已取消',stale:'設定或故事已變更','not-committed':'回覆未採用'};
    const outcomes={policy_block:'供應商內容阻擋',provider_refusal:'模型拒絕回覆',output_truncated:'供應商輸出截斷',empty_response:'供應商未回傳文字',api_error:'API 回應異常'};
    const items=[],publicReasons={merged:'隨故事回覆一併處理','merged-invalid':'這輪沒有可用的狀態資料，未更新狀態','invalid-output':'整理結果無法使用，原始對話仍保留'};
    for(const kind of Object.keys(kinds).filter(kind=>kind!=='memory-repair')){
      const calls=run.calls.filter(c=>c.kind===kind),decisions=run.decisions.filter(d=>d.kind===kind);
      if(!calls.length && !decisions.length)continue;
      const failed=calls.find(c=>c.status!=='success');
      const unusable=decisions.findLast(d=>['invalid-output','merged-invalid'].includes(d.reason));
      const diagnostic=calls.findLast(c=>outcomes[c.diagnostic?.outcome])?.diagnostic;
      const result=outcomes[diagnostic?.outcome] || (unusable?publicReasons[unusable.reason]:calls.length?statuses[failed?.status || 'success']:(publicReasons[decisions.at(-1).reason] || reasons[decisions.at(-1).reason]));
      items.push(`<p data-execution-kind="${esc(kind)}"><b>${esc(kinds[kind])}</b> · ${esc(result)}</p>`);
    }
    return `<section data-settings-execution style="overflow-wrap:anywhere"><h4>最近回覆狀態</h4><p>${esc(statuses[run.status])}</p>${items.join('')}</section>`;
  };
  window.BAORequestLedger=Object.freeze({decision,transport,snapshot,render,commitRevision});
})();
