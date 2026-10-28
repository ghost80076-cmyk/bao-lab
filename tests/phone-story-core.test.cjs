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
  Core.apply(state,{chat:[{from:'me',text:'玩家的訊息'}],threads:[{id:'me-only',messages:[{from:'me',text:'我說的'}]}]},'outgoing');
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
