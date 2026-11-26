const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/phone-story-core.js');

test('only valid tagged JSON at the end of an opt-in story turn is interpreted', () => {
  const raw='她看著螢幕。\n'+Core.OPEN+'\n'+JSON.stringify({
    chat:[{from:'them',time:'23:41',text:'你睡了嗎？'}],
    tweets:[{text:'夜裡下雨了',date:'23:50'}],
    calls:[{group:'今天',items:[{name:'未知',type:'未接',time:'23:55',count:1}]}]
  })+'\n'+Core.CLOSE;
  const result=Core.extract(raw);
  assert.equal(result.text,'她看著螢幕。');
  assert.equal(result.patch.chat[0].text,'你睡了嗎？');
  assert.equal(result.patch.tweets[0].text,'夜裡下雨了');
  assert.equal(result.patch.calls[0].items[0].type,'未接');
  assert.equal(Core.extract(raw+'extra').patch,null);
  assert.equal(Core.extract('普通角色說了訊息，但沒有事件區塊').patch,null);
});
test('invalid or irrelevant content never mutates a story or removes prose', () => {
  for (const raw of [
    '普通正文'+Core.OPEN+'{"chat":['+Core.CLOSE,
    '普通正文'+Core.OPEN+'{"arbitrary":"value"}'+Core.CLOSE,
    '普通正文'+Core.OPEN+'{"chat":[{"text":""}]}'+Core.CLOSE
  ]) {
    const parsed=Core.extract(raw);
    assert.equal(parsed.patch,null);
    assert.equal(parsed.text,raw);
  }
  const state={time:'今天'};
  assert.equal(Core.apply(state,null,'msg-1'),false);
  assert.equal(state.phoneUI,undefined);
});
test('story state append is bounded, idempotent and keeps user-owned initial config', () => {
  const base={enabled:true,userName:'지연',chat:[{text:'舊資料'}],tweets:['第一篇']};
  const state={};
  const patch=Core.normalizePatch({chat:[{text:'新增訊息',from:'them'}],
    tweets:['第二篇'],instagram:{messages:[{text:'視訊你好',from:'them'}]},
    events:[{time:'20:00',title:'吃飯'}]});
  assert.equal(Core.apply(state,patch,'msg-1'),true);
  assert.equal(Core.apply(state,patch,'msg-1'),false);
  assert.equal(state.phoneUI.chat.length,1);
  const display=Core.mergeDisplay(base,state.phoneUI);
  assert.equal(display.chat.length,2);
  assert.equal(display.chat[0].text,'舊資料');
  assert.equal(display.chat[1].text,'新增訊息');
  assert.equal(display.tweets.length,2);
  assert.equal(display.instagram.messages[0].text,'視訊你好');
  assert.equal(display.userName,'지연');
  assert.equal(Core.mergeDisplay(base,{}).chat.length,1);
  assert.equal(Core.mergeDisplay(null,state.phoneUI),null);
});
test('malformed and huge payloads cannot grow the saved story without bounds', () => {
  const input=Core.extract('story'+Core.OPEN+JSON.stringify({tweets:Array.from({length:500},(_,i)=>'post'+i)})+Core.CLOSE);
  assert.equal(input.patch.tweets.length,3);
  const huge='x'.repeat(9000);
  assert.equal(Core.extract('story'+Core.OPEN+huge+Core.CLOSE).patch,null);
  const state={};
  for(let i=0;i<120;i++) Core.apply(state,{chat:[{text:'a'+i}],tweets:[{text:'t'+i}],events:[{title:'e'+i}],instagram:{messages:[{text:'m'+i}]}},'m'+i);
  assert.equal(state.phoneUI.chat.length,120);
  assert.equal(state.phoneUI.tweets.length,80);
  assert.equal(state.phoneUI.events.length,8);
  assert.equal(state.phoneUI.seenIds.length,60);
});
test('update instructions are fixed and do not require extra model calls', () => {
  assert.match(Core.PROMPT,/增加事件密度/);
  assert.match(Core.PROMPT,/不得.*玩家/);
  assert.match(Core.PROMPT,/沒有變動時/);
  assert.ok(Core.PROMPT.includes(Core.OPEN));
  assert.ok(Core.PROMPT.includes(Core.CLOSE));
});

test('thread updates keep recipients and authorship separate, upsert documents and persist safely', () => {
  const base={contacts:[{id:'a',name:'小夏'}],threads:[{id:'group',name:'朋友群',participants:['a'],messages:[{senderId:'a',text:'開場'}]}],
    notes:[{id:'memo',title:'待辦',text:'舊筆記'}]};
  const state={};
  const patch=Core.normalizePatch({threads:[{id:'group',messages:[{senderId:'a',text:'新訊息'}]}],
    notes:[{id:'memo',title:'待辦',text:'新筆記'}],photos:[{id:'rain',src:'https://example.com/rain.jpg',caption:'收到的照片'}],storyTime:'23:17'});
  assert.equal(Core.apply(state,patch,'reply-1'),true);
  assert.equal(Core.apply(state,patch,'reply-1'),false);
  const loaded=JSON.parse(JSON.stringify(state));
  const display=Core.mergeDisplay(base,loaded.phoneUI);
  assert.equal(display.threads[0].name,'朋友群');
  assert.deepEqual(display.threads[0].participants,['a']);
  assert.deepEqual(display.threads[0].messages.map(x=>x.text),['開場','新訊息']);
  assert.equal(display.chat.length,0);
  assert.equal(display.notes.length,1);
  assert.equal(display.notes[0].text,'新筆記');
  assert.equal(display.photos[0].caption,'收到的照片');
  assert.equal(display.storyTime,'23:17');
  assert.equal(Core.apply(state,{enabled:false,threads:[{id:'x'}]},'bad'),false);
});

test('only accepted incoming updates create bounded notifications with stable targets', () => {
  const state={};
  Core.apply(state,{chat:[{from:'me',text:'玩家的訊息'}],threads:[{id:'me-only',messages:[{from:'me',text:'我說的'}]}],instagram:{messages:[{text:'既有視訊字幕'}]}},'outgoing');
  assert.deepEqual(Core.notifications(state.phoneUI),[]);
  const patch={threads:[{id:'group',messages:[{from:'them',text:'新訊息'}]}],notes:[{id:'memo',text:'下一步線索'}]};
  Core.apply(state,patch,'incoming');
  assert.deepEqual(Core.notifications(state.phoneUI).map(x=>[x.app,x.targetId]),[['kakao','group'],['notes','memo']]);
  assert.equal(Core.apply(state,patch,'incoming'),false);
  assert.equal(Core.notifications(state.phoneUI).length,2);
  state.phoneUI.notifications[0].read=true;
  const restored=JSON.parse(JSON.stringify(state));
  Core.apply(restored,{tweets:['下一篇']},'next-turn');
  assert.equal(Core.notifications(restored.phoneUI)[0].read,true);
  assert.equal(Core.notifications(restored.phoneUI).at(-1).read,false);
  for(let i=0;i<60;i++)Core.apply(restored,{notes:[{id:'memo',text:'更新'+i}]},'update-'+i);
  assert.equal(Core.notifications(restored.phoneUI).length,40);
  assert.equal(Core.notifications({version:1,notifications:[{id:'bad',app:'javascript:alert(1)'}]}).length,0);
});


test('X social events keep independent authors, replies and shared story event references', () => {
  const state={};
  const patch=Core.normalizePatch({tweets:[
    {id:'campus-1',authorId:'npc-a',authorName:'同學 A',authorHandle:'@first',
      eventId:'festival-1',sourceKind:'witness',text:'舞台上的事情我看到了',date:'週日'},
    {id:'reply-1',replyTo:'campus-1',authorId:'npc-b',authorName:'同學 B',
      sourceKind:'hearsay',text:'我聽說不是那樣',date:'週日'}
  ]});
  assert.equal(Core.apply(state,patch,'msg-social-1'),true);
  assert.equal(Core.apply(state,patch,'msg-social-1'),false);
  const saved=JSON.parse(JSON.stringify(state));
  const all=Core.mergeDisplay({enabled:true,userName:'手機主人',tweets:['舊版貼文']},saved.phoneUI).tweets;
  assert.equal(all.length,3);
  assert.equal(all[0].text,'舊版貼文');
  assert.equal(all[0].id,'legacy-1');
  assert.equal(all[1].authorHandle,'@first');
  assert.equal(all[1].eventId,'festival-1');
  assert.equal(all[1].sourceKind,'witness');
  assert.equal(all[2].replyTo,'campus-1');
  assert.equal(all[2].authorName,'同學 B');
  assert.equal(Core.notifications(state.phoneUI).length,1);
});

test('X auto-IDs stay stable on replay and outgoing replies do not create incoming notifications', () => {
  const state={};
  const patch={tweets:[{text:'沒有 ID 的貼文',authorName:'路人'}]};
  assert.equal(Core.apply(state,patch,'message-7'),true);
  const first=state.phoneUI.tweets[0].id;
  assert.match(first,/^turn-message-7-0$/);
  assert.equal(Core.apply(state,patch,'message-7'),false);
  const rebuilt={};
  assert.equal(Core.apply(rebuilt,patch,'message-7'),true);
  assert.equal(rebuilt.phoneUI.tweets[0].id,first);
  const own={};
  assert.equal(Core.apply(own,{tweets:[{id:'my-reply',replyTo:'post-1',text:'我的回覆',from:'me'}]},'outgoing-1'),true);
  assert.deepEqual(Core.notifications(own.phoneUI),[]);
  assert.equal(own.phoneUI.tweets[0].replyTo,'post-1');
});

test('group photo target binds exact membership and uses sender-owned replies only',()=>{
  const thread={id:'g',name:'群組',participants:['b','a']};
  const target=Core.groupPhotoTarget(thread,'群組',[{id:'a',name:'小夏'}]);
  assert.equal(target.key,Core.groupPhotoTarget({...thread,participants:['a','b']},'群組').key);
  assert.notEqual(target.key,Core.groupPhotoTarget({...thread,participants:['a','c']},'群組').key);
  assert.equal(Core.groupPhotoTarget({...thread,participants:['a']},'群組'),null);
  assert.equal(target.memberNames.a,'小夏');
  const image={data:'fixture'};
  const user={role:'user',content:target.prefix+'晚餐',storyImage:image};
  const reply={role:'assistant',id:'reply',phonePatch:{threads:[{id:'g',messages:[{from:'them',senderId:'a',text:'看到了'},{from:'them',senderId:'b',text:'看到了'}]}],photoOffer:{threadId:'g',senderId:'b',kind:'selfie',description:'晚餐照'}}};
  const rows=Core.groupPhotoExchanges([user,reply],target);
  assert.equal(rows.length,2);
  assert.equal(rows[0].image,image);
  assert.equal(rows[1].senderId,'b');
  assert.equal(rows[1].anchor.senderId,'b');
  const different=Core.groupPhotoTarget({...thread,participants:['a','c']},'群組');
  assert.deepEqual(Core.groupPhotoExchanges([user,reply],different),[]);
  const other=Core.groupPhotoTarget({...thread,id:'other'},'群組');
  assert.deepEqual(Core.groupPhotoExchanges([user,reply],other),[]);
  assert.deepEqual(Core.groupPhotoExchanges([{...user,content:'【KakaoTalk｜對 群組 發送訊息｜聊天室 ID：g】晚餐'},reply],target),[]);
  for(const senderId of ['outsider','',undefined]){
    const invalid={...reply,phonePatch:{...reply.phonePatch,photoOffer:{...reply.phonePatch.photoOffer,senderId}}};
    assert.equal(Core.groupPhotoExchanges([user,invalid],target).length,1);
  }
  const changed={...reply,phonePatch:{...reply.phonePatch,threads:[{...reply.phonePatch.threads[0],participants:['a','c']}]}};
  assert.equal(Core.groupPhotoExchanges([user,changed],target).length,1);
  const revised={...reply,variants:[{phonePatch:{...reply.phonePatch,photoOffer:{...reply.phonePatch.photoOffer,description:'新版照片'}}}],activeVariant:0};
  assert.notEqual(Core.groupPhotoExchanges([user,revised],target)[1].signature,rows[1].signature);
  assert.equal(Core.groupPhotoExchanges([user,reply,{role:'assistant',id:'extra',phonePatch:reply.phonePatch}],target).length,2);
});

test('X publication uses explicit player intent and public post ownership, never DM assets',()=>{
  const id='player-x-12345678-1234-1234-1234-123456789abc';
  const root={id:'root',from:'them',authorId:'a',text:'公開的貼文',replyTo:''};
  const user={role:'user',content:Core.xPublishPrefix(id,'root')+'我的午餐',storyImage:{data:'fixture'}};
  assert.deepEqual(Core.xPlayerIntent(user),{id,replyTo:'root',text:'我的午餐',from:'me'});
  const incoming={tweets:[{id,from:'me',text:'偽造文字'},{id:'npc-post',from:'them',authorId:'b',replyTo:id,text:'我也分享'}],xPhotoOffer:{postId:'npc-post',senderId:'b',kind:'scene',description:'公園'}};
  const patch=Core.withXPlayerPost(Core.normalizePatch(incoming),user,[root],()=>true);
  assert.equal(patch.tweets[0].text,'我的午餐');
  assert.equal(patch.tweets[0].from,'me');
  assert.equal(patch.tweets[0].authorId,'');
  const reply={role:'assistant',id:'reply',phonePatch:patch};
  const tweets=[root,...patch.tweets];
  const rows=Core.xPhotoRows([user,reply],tweets);
  assert.equal(rows.length,2);
  assert.equal(rows[0].image,user.storyImage);
  assert.equal(rows[1].senderId,'b');
  assert.equal(rows[1].key,JSON.stringify(['x','npc-post']));
  assert.deepEqual(Core.xPhotoRows([user,reply],tweets,id=>id!=='root'),[]);
  assert.deepEqual(Core.xPhotoRows([user,reply],[...tweets,root]),[]);
  assert.deepEqual(Core.xPhotoRows([{...user,content:'【KakaoTalk｜對 A 發送訊息】私訊'},reply],tweets),[]);
  assert.deepEqual(Core.xPhotoRows([{...user,content:'故事內的私人照片'},reply],tweets),[]);
  assert.deepEqual(Core.xPhotoRows([user,{...reply,variants:[{phonePatch:null}],activeVariant:0}],tweets),[]);
  assert.equal(Core.xPublicPost([{...root,replyTo:'root'}],'root'),null);
  assert.equal(Core.xPublicPost([{...root,replyTo:'missing'}],'root'),null);
  assert.equal(Core.withXPlayerPost(null,user,[root],()=>false),null);
  assert.equal(Core.withXPlayerPost(null,user,[...tweets],()=>true),null);
  assert.equal(Core.normalizePatch({...incoming,xPhotoOffer:{...incoming.xPhotoOffer,senderId:'a'}}).xPhotoOffer,undefined);
  assert.equal(Core.normalizePatch({xPhotoOffer:incoming.xPhotoOffer}),null);
});

test('X root posts need no model echo; ordinary text-only and private turns do not publish attachments',()=>{
 const id='player-x-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 const user={role:'user',content:Core.xPublishPrefix(id)+'今天的晚餐',storyImage:{data:'fixture'}};
 const patch=Core.withXPlayerPost(null,user,[]);
 assert.equal(patch.tweets[0].id,id);
 assert.equal(patch.tweets[0].replyTo,'');
 const message={role:'assistant',id:'m',phonePatch:patch};
 assert.equal(Core.xPhotoRows([user,message],patch.tweets).length,1);
 assert.equal(Core.xPhotoRows([{...user,content:'【X｜回覆貼文 ID：old】舊文字路徑'},message],patch.tweets).length,0);
 assert.equal(Core.xPhotoRows([user,message],[{...patch.tweets[0],text:'改寫'}]).length,0);
 assert.equal(Core.xPhotoRows([user,message],[{...patch.tweets[0],authorId:'npc'}]).length,0);
});

test('invalid X reply cannot publish model-echoed player attachment after target locks',()=>{
 const id='player-x-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 const root={id:'root',from:'them',authorId:'a',text:'root',replyTo:''};
 const user={role:'user',content:Core.xPublishPrefix(id,'root')+'照片',storyImage:{data:'fixture'}};
 const echo=Core.normalizePatch({tweets:[{id,replyTo:'root',from:'me',text:'照片'},{id:'other',from:'them',authorId:'a',text:'別的貼文'}]});
 const blocked=Core.withXPlayerPost(echo,user,[root],()=>false);
 assert.equal(blocked.tweets.length,1);
 assert.equal(blocked.tweets[0].id,'other');
 assert.equal(Core.xPhotoRows([user,{role:'assistant',id:'m',phonePatch:blocked}],[root,...blocked.tweets]).length,0);
});
