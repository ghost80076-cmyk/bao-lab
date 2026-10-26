const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../js/phone-interaction-core.js');
const Phone=require('../js/phone-ui-core.js');
const Player=require('../js/phone-player-core.js');
const target=(app,id)=>({app,id});
function fixture(){return Phone.normalize({userName:'玩家',apps:['notes','photos','kakao'],
  contacts:[{id:'friend',name:'好友'}],threads:[{id:'secret-chat',name:'秘密聊天室',messages:[{text:'未公開訊息'}]}],
  notes:[{id:'clue',title:'線索',text:'相簿密碼是 0427。'},{id:'safe',title:'保險箱',text:'秘密筆記'}],
  photos:[{id:'photo',title:'隱藏照片',src:'assets/rain.jpg',caption:'秘密照片內容'}],
  interactions:{version:1,locks:[{target:target('notes','safe'),code:'0427',hint:'四位數'},
    {target:target('photos','photo'),hidden:true},{target:target('kakao','secret-chat'),hidden:true}],
    events:[{id:'read-clue',when:{action:'read',target:target('notes','clue')},unlock:[],notification:'找到密碼線索'},
      {id:'open-safe',when:{action:'unlock',target:target('notes','safe')},requires:[{action:'read',target:target('notes','clue')}],unlock:[target('photos','photo')],notification:'相簿新增照片'},
      {id:'read-photo',when:{action:'read',target:target('photos','photo')},unlock:[target('kakao','secret-chat')],notification:'聊天室已解鎖'}]}});}
test('reading, exact passwords, prerequisites and cross-App chains persist once',()=>{
  const phone=fixture(), original=JSON.stringify(phone);
  assert.deepEqual(Core.validate(phone),[]);
  assert.deepEqual(Core.visibleItems(phone,null,'photos'),[]);
  assert.equal(Core.open(phone,null,target('photos','photo'),'0427').ok,false);
  assert.equal(Core.open(phone,null,target('notes','safe'),'wrong').ok,false);
  const first=Core.open(phone,null,target('notes','clue'));
  assert.deepEqual(first.notifications,['找到密碼線索']);
  assert.equal(Core.open(phone,first.progress,target('notes','clue')).changed,false);
  const unlocked=Core.open(phone,first.progress,target('notes','safe'),'0427');
  assert.deepEqual(unlocked.notifications,['相簿新增照片']);
  assert.equal(Core.access(phone,unlocked.progress,target('photos','photo')).hidden,false);
  assert.equal(Core.access(phone,unlocked.progress,target('kakao','secret-chat')).hidden,true);
  const read=Core.open(phone,JSON.parse(JSON.stringify(unlocked.progress)),target('photos','photo'));
  assert.equal(Core.access(phone,read.progress,target('kakao','secret-chat')).locked,false);
  assert.deepEqual(Core.open(phone,read.progress,target('photos','photo')).notifications,[]);
  assert.equal(JSON.stringify(phone),original);
});
test('a prerequisite fulfilled later resolves pending events without reentering the password',()=>{
  const phone=fixture();
  const opened=Core.open(phone,null,target('notes','safe'),'0427');
  assert.equal(Core.access(phone,opened.progress,target('photos','photo')).hidden,true);
  const clue=Core.open(phone,opened.progress,target('notes','clue'));
  assert.equal(Core.access(phone,clue.progress,target('photos','photo')).locked,false);
});
test('cycles terminate and each authored event runs once',()=>{
  const phone=fixture();
  phone.interactions.events.push({id:'cycle',when:{action:'unlock',target:target('photos','photo')},requires:[],unlock:[target('notes','safe')],notification:'連鎖'});
  const clue=Core.open(phone,null,target('notes','clue'));
  const result=Core.open(phone,clue.progress,target('notes','safe'),'0427');
  assert.deepEqual(result.progress.fired,['read-clue','open-safe','cycle']);
  assert.equal(Core.open(phone,result.progress,target('notes','safe')).changed,false);
});
test('locked and hidden payloads and passwords are absent from prompt descriptions',()=>{
  const phone=fixture();
  phone.contacts.push({id:'hidden-person',name:'NEVER_CONTACT'});
  phone.threads[0].participants=['hidden-person'];
  const visible=Core.forPrompt(phone,null);
  assert.deepEqual(visible.notes.map(x=>x.id),['clue']);
  assert.deepEqual(visible.photos,[]);assert.deepEqual(visible.threads,[]);
  const prompt=Player.ownerDescription({},phone);
  for(const secret of ['0427','秘密筆記','隱藏照片','秘密聊天室','read-photo','NEVER_CONTACT'])assert.equal(prompt.includes(secret),false,secret);
  const state={};state.phoneInteractions=Core.open(phone,null,target('notes','safe'),'0427').progress;
  assert.ok(Player.ownerDescription(state,phone).includes('保險箱'));
  assert.equal(Player.ownerDescription(state,phone).includes('0427'),false);
});
test('invalid references, unsupported effects and malformed input fail without mutating progress',()=>{
  const variants=[
    p=>p.interactions.locks.push({target:target('notes','missing')}),
    p=>p.interactions.events[0].unlock=[target('notes','clue')],
    p=>p.interactions.events[0].script='alert(1)',
    p=>p.interactions.events[0].notification=42,
    p=>p.interactions.locks.push(p.interactions.locks[0]),
    p=>p.interactions.events.push(p.interactions.events[0]),
    p=>p.interactions.version=2
  ];
  for(const mutate of variants){
    const phone=fixture();mutate(phone);const before=JSON.stringify(phone);
    assert.ok(Core.validate(phone).length);
    assert.equal(Core.open(phone,null,target('notes','clue')).ok,false);
    assert.equal(JSON.stringify(phone),before);
  }
  const p=Core.progress(fixture(),{version:1,read:['notes:clue','notes:clue','notes:missing'],unlocked:['photos:photo','notes:clue'],fired:['missing']});
  assert.deepEqual(p,{version:1,read:['notes:clue'],unlocked:['photos:photo'],fired:[]});
});
test('legacy phone surfaces remain unchanged and player JSON preserves authored mechanisms',()=>{
  const legacy=Phone.normalize({chat:[{text:'舊訊息'}]});
  assert.equal(legacy.interactions,null);
  assert.deepEqual(Core.forPrompt(legacy,null),legacy);
  const phone=fixture();
  const state={phoneSurface:{version:1,enabled:true,data:{interactions:phone.interactions}}};
  assert.deepEqual(Player.resolve(phone,state).interactions,phone.interactions);
  const badState={phoneInteractions:{version:1,unlocked:[],read:[],fired:[]}};
  Core.open(phone,badState.phoneInteractions,target('notes','safe'),'incorrect');
  assert.deepEqual(badState.phoneInteractions,{version:1,unlocked:[],read:[],fired:[]});
});

test('invalid conditions remain closed after normalization instead of dropping requirements',()=>{
  for(const corrupt of [
    p=>p.interactions.events[1].requires=[{action:'script',target:{app:'notes',id:'clue'}}],
    p=>p.interactions.version=2,
    p=>p.interactions.events[1].requires='broken'
  ]){
    const source=fixture();corrupt(source);
    const phone=Phone.normalize(source);
    assert.equal(phone.interactions.invalid,true);
    assert.deepEqual(Core.visibleItems(phone,null,'notes'),[]);
    assert.deepEqual(Core.forPrompt(phone,null).notes,[]);
    assert.equal(Core.open(phone,null,{app:'notes',id:'safe'},'0427').ok,false);
    assert.equal(Phone.normalize(phone).interactions.invalid,true);
  }
});
