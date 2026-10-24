'use strict';
// Production save sanitizer, preference resolvers, builders and serializers.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const variants={...require('./fixtures/narrative-variants.cjs'),playerPortrayal:['strict','natural','coauthor'],observationMode:['off','one_turn']};
const book=require('../js/worldbook-library-core.js');
function client(values=new Map()){
  const requests=[];
  const c={console,structuredClone,Date,URL,Response,AbortController,TextDecoder,TextEncoder,
    setTimeout(){},clearTimeout(){},addEventListener(){},MutationObserver:class{observe(){}},YoruWorldbookLibraryCore:book,
    localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},
    document:{readyState:'loading',head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,
      createElement:()=>({classList:{toggle(){}},dataset:{},setAttribute(){}}),addEventListener(){}},
    fetch:async(url,init)=>{assert.ok(init?.body,'no catalog/network fetch during settings lifecycle');requests.push(JSON.parse(init.body));return new Response(JSON.stringify({choices:[{message:{content:'ok'}}],content:[{type:'text',text:'ok'}],candidates:[{content:{parts:[{text:'ok'}]}}]}));},
    GameState:{current:{}},
    Chat:{messages:[{id:'u',role:'user',content:'LIFECYCLE_QUERY'}],summary:'',usage:{},
      ensureMessageIds(messages=this.messages){return structuredClone(messages);},async context(){return this.messages.map(m=>({role:m.role,content:m.content}));},
      add(){},reset(){},renderUsage(){},addUsage(){},async maybeSummarize(){}},
    App:{config:{api:{},memory:{}},activeCharacter:{id:'lifecycle',name:'Lifecycle',world_modules:[]},characters:[],
      buildSystemPrompt(){return 'CHARACTER\n\n【目前核心狀態】\nLOCATION:'+c.GameState.current.location;},escapeHTML:String,escapeAttr:String,
      collectConfig(){return this.config;},renderChatShell(){},openBuilder(){},saveStory(){},startStory(){},sendMessage(){},renderUIPanel(){},renderStoryMessage:String,
      getSelectedPreset(){return null;},
      wrapBuildSystemPrompt(id,fn){const next=this.buildSystemPrompt.bind(this);this.buildSystemPrompt=(...args)=>fn.call(this,next,...args);},
      wrapBuildMessages(id,fn){const next=this.buildMessages.bind(this);this.buildMessages=(...args)=>fn.call(this,next,...args);}}
  };
  c.window=c;vm.createContext(c);
  const load=name=>vm.runInContext(fs.readFileSync(`js/${name}.js`,'utf8')+(name==='api'?';window.API=API;':''),c,{filename:name});
  vm.runInContext(fs.readFileSync('js/storage.js','utf8').replace(/Storage\.init\(\);\s*$/,'')+';window.Storage=Storage;',c);
  for(const name of ['api','player-settings','narrative-settings','prompt-cache','prompt-orchestrator','worldbook-library','actor-mode-core','actor-mode','phone-ui-core','phone-player-core','phone-story-core','phone-story-bridge'])load(name);
  c.App.characters=[c.App.activeCharacter];
  return {c,values,requests};
}
const seed=c=>{
  c.App.config={api:{type:'custom',model:'model',key:'NEVER_EXPORT_KEY',baseUrl:'https://mock.invalid',retryEnabled:false},
    persona:{name:'旅人'},narrative:{},memory:{mode:'full',maxRounds:20,maxContext:64000},stateTracking:false};
  c.GameState.current={location:'LIFECYCLE_LOCATION',storySessionId:'fixed-session',memorySlots:[{id:'note',text:'STORY_NOTE',enabled:true}],
    actorMode:{enabled:true,roleActive:true,role:{label:'LIFECYCLE_IDENTITY'}},phoneSurface:{version:1,enabled:true,userName:'LIFECYCLE_OWNER'},
    interpretationMods:{enabled:['bun-interpreter'],detailMode:'detailed'},commentaryMods:{enabled:['director-commentary']},
    worldbookLibrary:{version:1,enabled:['lifecycle-book'],pinned:{},recallMode:'auto',installed:[book.normalizePack({schema:book.SCHEMA,version:1,
      meta:{id:'lifecycle-book',name:'Book',world:'general'},entries:[{id:'fixed',mode:'constant',content:'LIFECYCLE_FIXED'},
        {id:'dynamic',mode:'keyword',keywords:['LIFECYCLE_QUERY'],content:'LIFECYCLE_DYNAMIC'}]})]}};
};
const prompt=c=>c.App.buildMessages(c.App.config);
(async()=>{
  const h=client();h.c.BAOPlayerSettings.set({pov:'third',dialogueFormat:'named',language:'en',replyLength:'short'});
  h.c.BAONarrativeSettings.set({density:'rich',playerPortrayal:'coauthor',observationMode:'one_turn'});
  let count=0;
  for(const [key,values] of Object.entries(variants))for(const value of values){
    const c=h.c;seed(c);c.App.config.narrative={[key]:value};
    const original=JSON.stringify(await prompt(c));
    const payload=c.Storage.buildStoryPayload('matrix');
    assert.doesNotMatch(JSON.stringify(payload),/NEVER_EXPORT_KEY/);
    const imported=await c.Storage.importFile({text:async()=>JSON.stringify(payload)});
    assert.equal(c.Storage.restoreStory(imported),true,key+': JSON import restore');
    assert.equal(JSON.stringify(await prompt(c)),original,key+': import preserves exact assembled bytes');
    const other=structuredClone(imported);other.config.narrative={density:'concise'};other.state.phoneSurface.enabled=false;other.state.actorMode.enabled=false;
    assert.equal(c.Storage.restoreStory(other),true);assert.equal(c.Storage.restoreStory(imported),true);
    assert.equal(JSON.stringify(await prompt(c)),original,key+': switch away/back restores choices');
    assert.equal(c.GameState.current.interpretationMods.detailMode,'detailed');
    assert.equal(c.GameState.current.commentaryMods.enabled[0],'director-commentary');
    assert.equal(c.GameState.current.memorySlots[0].text,'STORY_NOTE');
    const fresh=client(h.values);assert.equal(fresh.c.Storage.restoreStory(imported),true);
    const after=await prompt(fresh.c);assert.equal(JSON.stringify(after),original,key+': runtime reload retains exact prompt');
    for(const protocol of ['openai','anthropic','gemini']){
      await fresh.c.API.send({...fresh.c.App.config.api,key:'test',protocol,type:protocol},after);
      const body=JSON.stringify(fresh.requests.at(-1));
      for(const marker of ['LIFECYCLE_IDENTITY','LIFECYCLE_OWNER','LIFECYCLE_FIXED','LIFECYCLE_DYNAMIC'])assert.ok(body.includes(marker),`${key}/${protocol}: ${marker}`);
    }
    assert.equal(fresh.requests.length,3,'save/load/inspect adds no model calls');count++;
  }
  // Existing browser defaults win; story-local choices still come from the save.
  const c=h.c;seed(c);const old=c.Storage.buildStoryPayload();
  c.BAOPlayerSettings.set({language:'zh-Hant',pov:'second',replyLength:'long'});c.BAONarrativeSettings.set({density:'concise'});
  assert.equal(c.Storage.restoreStory(old),true);assert.equal(c.BAOPlayerSettings.get().language,'zh-Hant');assert.equal(c.BAONarrativeSettings.get().density,'concise');
  // Legacy stories may inherit prose defaults, never coauthor/observation authorization.
  delete old.config.narrative;c.BAONarrativeSettings.set({playerPortrayal:'coauthor',observationMode:'one_turn',density:'rich'});
  assert.equal(c.Storage.restoreStory(old),true);assert.equal(c.BAONarrativeSettings.playerPortrayal(c.App.config),'strict');assert.equal(c.BAONarrativeSettings.observationAllowed(c.App.config),false);
  assert.equal(c.BAONarrativeSettings.inspect(c.App.config).prefs.density,'rich');
  // A device with no preferences hydrates them from a backup, without API keys.
  const clean=client();assert.equal(clean.c.Storage.restoreStory(old),true);assert.equal(clean.c.BAOPlayerSettings.get().language,'en');assert.equal(clean.c.App.config.api.key,'');
  assert.equal(h.requests.length,0);
  let browserCount=0;
  for(const [key,choices] of Object.entries({replyLength:['short','long','auto'],pov:['card','first','second','third'],dialogueFormat:['card','named'],language:['zh-Hant','zh-Hans','en']}))for(const value of choices){
    const b=client();seed(b.c);const prior=b.c.Storage.buildStoryPayload();
    b.c.BAOPlayerSettings.set({...b.c.BAOPlayerSettings.get(),[key]:value});
    const before=JSON.stringify(await prompt(b.c));
    assert.equal(b.c.Storage.restoreStory(prior),true);assert.equal(b.c.BAOPlayerSettings.get()[key],value);
    assert.equal(JSON.stringify(await prompt(b.c)),before,`${key}/${value}: old save cannot rewind a browser choice`);
    const reload=client(b.values);assert.equal(reload.c.Storage.restoreStory(prior),true);
    assert.equal(JSON.stringify(await prompt(reload.c)),before,`${key}/${value}: runtime reload`);
    const messages=await prompt(reload.c);
    for(const protocol of ['openai','anthropic','gemini']){
      await reload.c.API.send({...reload.c.App.config.api,key:'test',protocol,type:protocol},messages);
      const body=reload.requests.at(-1),serialized=body.messages?[body.system || '',...body.messages.map(m=>m.content)].join('\n'):
        [...(body.systemInstruction?.parts || []),...body.contents.flatMap(m=>m.parts)].map(p=>p.text).join('\n');
      assert.ok(serialized.includes(reload.c.BAOPlayerSettings.inspectPrompt(reload.c.App.config).instructions[key]),`${key}/${value}: ${protocol}`);
    }
    browserCount++;
  }
  console.log(`PASS ${count} narrative + ${browserCount} browser choices × import/switch/runtime reload × 3 protocol sends, combined controls, legacy authorization and no extra calls`);
})().catch(error=>{console.error(error);process.exitCode=1;});
