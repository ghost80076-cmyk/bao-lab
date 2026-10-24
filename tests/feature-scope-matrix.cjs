'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bodies=[];
const c={console,structuredClone,Date,URL,Response,AbortController,TextDecoder,TextEncoder,setTimeout(){},clearTimeout(){},
  document:{addEventListener(){},getElementById:()=>null,querySelector:()=>null},
  fetch:async(url,init)=>{bodies.push(JSON.parse(init.body));return new Response(JSON.stringify({choices:[{message:{content:'{}'}}],content:[{type:'text',text:'{}'}],candidates:[{content:{parts:[{text:'{}'}]}}]}));},
  App:{activeCharacter:null,config:{},buildSystemPrompt:()=> 'CHARACTER',renderChatShell(){},openBuilder(){},renderUIPanel(){},escapeHTML:String},
  Chat:{messages:[]}};
c.window=c;vm.createContext(c);
for(const name of ['api','state','world-state','helper-data','character-status','world-modules','world-relevance']){
  const expose={api:'API',state:'GameState','world-state':'WorldStateEngine'}[name];
  vm.runInContext(fs.readFileSync(`js/${name}.js`,'utf8')+(expose?`;window.${expose}=${expose};`:''),c,{filename:name});
}
const api=protocol=>({model:'audit',key:'test',baseUrl:'https://mock.invalid/v1',protocol,type:protocol,retryEnabled:false});
const begin=(character,mode='immersive',display='text')=>{
  c.App.activeCharacter=character;c.App.config={api:api('openai'),persona:{name:'旅人'},narrativeMode:mode,displayMode:display,stateTracking:true};
  c.GameState.create(character,c.App.config);c.BAOWorldModules.ensureState(character);c.BAOCharacterStatus.ensureState(character);
};
(async()=>{
  let moduleCases=0,fieldCases=0;
  for(const context of ['core','relevant','ui_only'])for(const tracking of ['high','medium','low','manual'])for(const mode of ['immersive','world'])for(const display of ['text','ui']){
    const character={id:'module',name:'測試角色',world_modules:[{id:'audit',label:'範圍測試',kind:'object',context,tracking,triggers:['TRIGGER'],fields:[{key:'marker',label:'標記',type:'text'}],}],initial_state:{modules:{audit:{marker:'MOD_MARKER'}}}};
    begin(character,mode,display);c.Chat.messages=[{role:'user',content:'TRIGGER'}];
    let prompt=c.App.buildSystemPrompt();assert.equal(prompt.includes('MOD_MARKER'),context!=='ui_only',`${context}/${tracking}/${mode}/${display}`);
    c.Chat.messages=[{role:'user',content:'普通閒聊'}];prompt=c.App.buildSystemPrompt();assert.equal(prompt.includes('MOD_MARKER'),context==='core','irrelevant data must be excluded');
    c.Chat.messages=[{role:'user',content:'TRIGGER'}];prompt=c.App.buildSystemPrompt();
    for(const protocol of ['openai','anthropic','gemini']){
      await c.API.send(api(protocol),[{role:'system',content:prompt},{role:'user',content:'TRIGGER'}]);
      assert.equal(JSON.stringify(bodies.at(-1)).includes('MOD_MARKER'),context!=='ui_only',`${protocol}: module context survived serialization`);
    }
    // Tracking frequency is independent of context/display. Four state calls
    // reveal only the due modules in their snapshots/schema, including ui_only.
    for(let tick=1;tick<=4;tick++){
      await c.WorldStateEngine.update(c.App.config,'普通閒聊','沒有提到模組');
      const expected=tracking==='high'||tracking==='medium'&&tick%2===0||tracking==='low'&&tick%4===0;
      assert.equal(JSON.stringify(bodies.at(-1)).includes('MOD_MARKER'),expected,`${tracking}: tick ${tick}`);
    }
    moduleCases++;
  }
  for(const context of ['core','relevant','ui_only'])for(const track of [false,true])for(const [type,value] of [['text','FIELD_MARKER'],['number',17],['meter',23],['boolean',true],['tags',['FIELD_TAG']]]){
    const character={id:'field',name:'測試角色',character_status:{enabled:true,fields:[{key:'audit_field',label:'欄位測試',type,context,track,default:value}]}};
    begin(character);c.GameState.upsertNPC({name:'測試角色',presence:'present'});
    const matched=c.BAOCharacterStatus.compactForPrompt('我查看欄位測試');
    assert.equal(matched.text.includes('欄位測試='),context!=='ui_only',`${type}/${context}/${track}`);
    assert.equal(c.BAOCharacterStatus.compactForPrompt('普通閒聊').text.includes('欄位測試='),context==='core');
    const snapshot=c.BAOCharacterStatus.snapshotForTracker('測試角色');
    assert.equal(Object.hasOwn(snapshot['測試角色'] || {},'audit_field'),track,'tracking does not depend on main prompt scope');
    fieldCases++;
  }
  begin({id:'disabled',name:'停用角色',character_status:{enabled:false,fields:[{key:'tracked',context:'core',track:true,default:'DISABLED_FIELD'}]}});
  c.App.config.stateTracking=false;
  assert.equal(c.BAOCharacterStatus.hasTrackedFields(),false,'disabled field system must not force paid state tracking');
  assert.equal(c.WorldStateEngine.enabled(c.App.config),false);
  const before=bodies.length;await c.WorldStateEngine.update(c.App.config,'QUERY','STORY');assert.equal(bodies.length,before);
  console.log(`PASS ${moduleCases} module context/tracking/mode/layout cases × 3 protocols + 4 tracking ticks; ${fieldCases} character field type/context/tracking cases; disabled fields make zero state calls`);
})().catch(error=>{console.error(error);process.exitCode=1;});
