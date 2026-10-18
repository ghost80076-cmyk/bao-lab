const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(`js/${name}.js`, 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function harness(named=false) {
  const wait=deferred(), timers=[], mounts=[], clears=[], args=[], alerts=[], html=[];
  const input={value:'繼續',setAttribute(){}}, labels={}; let saved=0, api=0;
  const c={console, GameState:{current:{}}, Chat:{messages:[],add(role,content){this.messages.push({role,content});}},
    localStorage:{getItem:()=>null,setItem(){}}, alert:x=>alerts.push(x),
    document:{addEventListener(){},readyState:'loading',getElementById:id=>id==='user-input'?input:id==='chat-stream'?{insertAdjacentHTML:(...a)=>html.push(a),scrollHeight:300}:id==='chat-view'?{classList:{contains:()=>true}}:id.startsWith('usage-')?(labels[id]??={}):null,
      createElement:()=>({}),head:{append(){}},querySelector:()=>null},
    setTimeout:fn=>timers.push(fn),addEventListener(){},BAOActionChoiceDock:{clear:x=>clears.push(x),mount:x=>mounts.push(x)}};
  c.window=c;
  c.App={config:{},activeCharacter:{},escapeHTML:x=>String(x),formatMessage:x=>x, renderDetail(){},renderUIPanel(){},openBuilder(){},collectConfig(){return {};},buildSystemPrompt(){return '';},startStory(){},resumeSavedStory(){},renderChatShell(){},
    saveStory(){saved++;},sendMessage(...a){args.push(a);api++;return wait.promise;}};
  if(named)c.App.wrapSendMessage=(key,wrapper)=>{const prev=c.App.sendMessage;c.App.sendMessage=function(...a){return wrapper.call(this,prev.bind(this),...a);};};
  vm.createContext(c);
  return {c,wait,timers,mounts,clears,args,alerts,input,labels,html,saved:()=>saved,api:()=>api,flush(){for(const fn of timers.splice(0))fn();}};
}
const cards=['host-club-simulator','night-sky-magic-academy','k-idol-survival-simulator'];
async function choices(named) {
  for(const card of cards)for(const phase of ['await','timer'])for(const change of ['story','config','character','pending','none']){
    const h=harness(named);h.c.App.activeCharacter={id:card};
    h.c.Chat.messages=[{id:'reply',role:'assistant',content:card===cards[0]?'A. 去看看\nB. 先觀察\nD. 自由行動':'1. 去看看\n2. 先觀察\n5. 自由行動'}];
    vm.runInContext(read(card+'-ui'),h.c);
    const task=h.c.App.sendMessage('a',{b:true});
    const mutate=()=>{if(change==='story')h.c.GameState.current={};if(change==='config')h.c.App.config={};if(change==='character')h.c.App.activeCharacter={id:card};if(change==='pending')h.c.App.__requestPending=true;};
    if(phase==='await')mutate();h.wait.resolve('result');assert.equal(await task,'result');
    if(phase==='timer')mutate();h.flush();
    assert.equal(h.mounts.length,change==='none'?1:0,`${card}/${phase}/${change}`);
    assert.equal(h.clears.length,change==='none'?2:1,'stale callbacks must not clear current choices');
    assert.deepEqual(h.args,[['a',{b:true}]]);assert.equal(h.api(),1);
  }
  for(const card of cards){
    const h=harness(named);h.c.App.activeCharacter={id:card};h.c.App.config.api={key:'mock'};h.c.API={};h.c.AbortController=AbortController;
    h.c.Chat.messages=[{role:'assistant',content:card===cards[0]?'A. 觀察\nB. 交談':'1. 觀察\n2. 交談'}];
    vm.runInContext(read(card+'-ui'),h.c);vm.runInContext(read('request-lifecycle'),h.c);const task=h.c.App.sendMessage();assert.equal(h.c.App.__requestPending,true);h.wait.resolve();await task;
    assert.equal(h.c.App.__requestPending,false);h.flush();assert.equal(h.mounts.length,1,'outer lifecycle unlocks after nested hook returns');
  }
  for(const card of cards){const h=harness(named);h.c.App.activeCharacter={id:card};vm.runInContext(read(card+'-ui'),h.c);const task=h.c.App.sendMessage();const error=new Error('provider');h.wait.reject(error);await assert.rejects(task,e=>e===error);h.flush();assert.equal(h.mounts.length,0);}
}
async function previews(){
  for(const module of ['no-api-world-preview','player-settings']){
    const h=harness();vm.runInContext(read(module),h.c);
    const task=h.c.App.sendMessage('first',{second:true});h.wait.resolve('normal');assert.equal(await task,'normal');assert.deepEqual(h.args,[['first',{second:true}]],module+' must forward arguments');
  }
  for(const order of [['no-api-world-preview','player-settings'],['player-settings','no-api-world-preview']]){
    const h=harness();for(const name of order)vm.runInContext(read(name),h.c);
    h.c.App.activeCharacter={id:'autonomous-npc-world'};h.c.App.config={offlineWorldPreview:true};
    await h.c.App.sendMessage();assert.equal(h.api(),0);assert.equal(h.alerts.length,1);assert.equal(h.input.value,'繼續');assert.equal(h.c.Chat.messages.length,0);
    h.c.App.activeCharacter={id:'demo'};h.c.App.config={demoMode:true};
    await h.c.App.sendMessage();assert.equal(h.api(),0);assert.equal(h.c.Chat.messages.length,2);assert.equal(h.c.Chat.messages[0].role,'user');assert.equal(h.c.Chat.messages[1].role,'assistant');assert.equal(h.input.value,'');assert.equal(h.saved(),1);assert.equal(h.labels['usage-memory'].textContent,'本機預覽');
    await h.c.App.sendMessage();assert.equal(h.api(),0);assert.equal(h.saved(),1,'empty local send is a no-op');
  }
}
(async()=>{await choices(false);await choices(true);await previews();console.log('Remaining send hooks: 60 delayed choice cases, error identity, arguments and zero-provider previews passed');})().catch(e=>{console.error(e);process.exitCode=1;});
