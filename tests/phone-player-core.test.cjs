const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/phone-player-core.js');
const Phone = require('../js/phone-ui-core.js');

test('legacy stories start without phone and explicit opt-in enables a blank surface', () => {
  const state={time:'23:00'};
  assert.equal(Core.resolve(null,state),null);
  assert.equal(Core.write(state,{version:1,enabled:true,userName:'未知手機',contactName:'同事'}),true);
  const resolved=Core.resolve(null,state);
  assert.equal(resolved.userName,'未知手機');
  assert.equal(resolved.contactName,'同事');
  assert.deepEqual(resolved.chat,[]);
  assert.deepEqual(resolved.tweets,[]);
  assert.equal(state.time,'23:00');
});
test('author defaults survive until a story-specific override changes visibility', () => {
  const card={userName:'作者手機主人',contactName:'作者聯絡人',chat:[{text:'作者訊息'}]};
  const story={};
  assert.equal(Core.resolve(card,story).userName,'作者手機主人');
  assert.equal(Core.write(story,{version:1,enabled:false}),true);
  assert.equal(Core.resolve(card,story),null);
  assert.equal(card.userName,'作者手機主人');
  assert.equal(card.chat[0].text,'作者訊息');
  delete story.phoneSurface;
  assert.equal(Core.resolve(card,story).chat[0].text,'作者訊息');
});
test('player override stays within the owning story and clamps input', () => {
  const author={userName:'預設',contactName:'原始人物',tweets:['作者貼文']};
  const first={};
  const second={};
  Core.write(first,{version:1,enabled:true,userName:'a'.repeat(200),contactName:'陌生人',twitterHandle:'@x'});
  assert.equal(Core.resolve(author,first).userName.length,80);
  assert.equal(Core.resolve(author,first).contactName,'陌生人');
  assert.equal(Core.resolve(author,second).contactName,'原始人物');
  assert.equal(Core.resolve(author,first).tweets[0].text,'作者貼文');
});
test('partial JSON seeds preserve author data while overriding selected fields', () => {
  const author={wallpaper:'https://example.com/bg.png',userName:'原人物',
    chat:[{text:'作者舊訊息'}],tweets:['作者推文'],
    instagram:{callerName:'作者專屬來電人',avatar:'https://example.com/avatar.png'}};
  const state={};
  Core.write(state,{version:1,enabled:true,userName:'新主人',contactName:'新聯絡人',
    data:{tweets:['玩家自訂貼文'],weather:{place:'基隆'},spotify:{playlistName:'玩家歌單'}}});
  const result=Core.resolve(author,state);
  assert.equal(result.userName,'新主人');
  assert.equal(result.weather.place,'基隆');
  assert.equal(result.wallpaper,'https://example.com/bg.png');
  assert.equal(result.chat[0].text,'作者舊訊息');
  assert.equal(result.tweets[0].text,'玩家自訂貼文');
  assert.equal(result.instagram.callerName,'作者專屬來電人');
  assert.equal(result.instagram.avatar,'https://example.com/avatar.png');
  assert.equal(result.spotify.playlistName,'玩家歌單');
  assert.equal(author.tweets[0],'作者推文');
});
test('player-provided HTML is inert text and does not change card defaults', () => {
  const state={};
  Core.write(state,{version:1,enabled:true,userName:'<script>alert(1)</script>',
    data:{chat:[{text:'<img onerror=alert(1)>',from:'them'}],wallpaper:'javascript:alert(1)'}});
  const phone=Core.resolve(null,state);
  assert.equal(phone.userName,'<script>alert(1)</script>');
  assert.equal(phone.chat[0].text,'<img onerror=alert(1)>');
  assert.equal(phone.wallpaper,'');
  assert.equal(Core.read({version:8,enabled:true}),null);
  assert.equal(Core.resolve(null,{phoneSurface:{enabled:true}}),null);
  assert.equal(Phone.normalize(null),null);
});
test('prompt describes only the selected current story and does not assume phone owner', () => {
  const story={};
  Core.write(story,{version:1,enabled:true,userName:'',contactName:'林曼'});
  const prompt=Core.ownerDescription(story,null);
  assert.match(prompt,/手機主人：未指定/);
  assert.match(prompt,/主要聯絡人：林曼/);
  assert.match(prompt,/不得推定是玩家/);
  Core.write(story,{version:1,enabled:false});
  assert.equal(Core.ownerDescription(story,null),'');
});
