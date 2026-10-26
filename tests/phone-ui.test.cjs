const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/phone-ui-core.js');

test('phone is opt-in and does not invent a character or setting', () => {
  assert.equal(Core.normalize(null), null);
  assert.equal(Core.normalize({enabled:false}), null);
  const value = Core.normalize(Core.defaultConfig());
  assert.equal(value.enabled, true);
  assert.equal(value.userName, '');
  assert.deepEqual(value.chat, []);
  assert.deepEqual(value.tweets, []);
  assert.deepEqual(value.spotify.tracks, []);
});

test('normalize legacy chat/tweet config without evaluating markup', () => {
  const result = Core.normalize({
    userName:'나', contactName:'지연',
    chat:[{time:'12:30',text:'<img src=x onerror=alert(1)>'},{time:'12:31',text:'알겠어',from:'me'}],
    tweets:['어젯밤', {text:'안녕',likes:4,date:'오늘'}],
    spotify:{playlistName:'그날 밤',tracks:[{title:'Track',artist:'A',duration:28,audio:'assets/music/test.mp3'}]}
  });
  assert.equal(result.chat[0].text,'<img src=x onerror=alert(1)>');
  assert.equal(result.chat[0].from,'them');
  assert.equal(result.chat[1].from,'me');
  assert.equal(result.tweets[0].text,'어젯밤');
  assert.equal(result.tweets[1].likes,'4');
  assert.equal(result.spotify.tracks[0].duration,28);
});

test('block executable and traversal media; bound large fields', () => {
  const value = Core.normalize({
    wallpaper:'javascript:alert(1)',
    instagram:{avatar:'data:text/html;base64,AA',video:'assets/../secret.mp4'},
    spotify:{tracks:[{title:'x'.repeat(2000),audio:'https://example.com/a.mp3'}]},
    chat:Array.from({length:500},()=>({text:'a'.repeat(5000)}))
  });
  assert.equal(value.wallpaper,'');
  assert.equal(value.instagram.avatar,'');
  assert.equal(value.instagram.video,'');
  assert.equal(value.spotify.tracks[0].title.length,120);
  assert.equal(value.spotify.tracks[0].audio,'https://example.com/a.mp3');
  assert.equal(value.chat.length,150);
  assert.equal(value.chat[0].text.length,1600);
});

test('entry points load the core before character and runtime scripts', () => {
  const main = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const studio = fs.readFileSync(path.join(__dirname,'../character-studio.html'),'utf8');
  const character = fs.readFileSync(path.join(__dirname,'../js/character.js'),'utf8');
  const editor = fs.readFileSync(path.join(__dirname,'../js/character-studio.js'),'utf8');
  assert.ok(main.indexOf('js/phone-interaction-core.js') >= 0);
  assert.ok(main.indexOf('js/phone-interaction-core.js') < main.indexOf('js/phone-ui-core.js'));
  assert.ok(studio.indexOf('js/phone-interaction-core.js') < studio.indexOf('js/phone-ui-core.js'));
  assert.ok(main.indexOf('js/phone-ui-core.js') < main.indexOf('js/character.js'));
  assert.ok(main.indexOf('js/phone-ui.js') > main.indexOf('js/app.js'));
  assert.ok(studio.indexOf('js/phone-ui-core.js') < studio.indexOf('js/character.js'));
  assert.match(character,/phone_ui:.*phoneUI/s);
  assert.match(editor,/phone_ui: readPhoneUI\(\)/);
  assert.match(editor,/presentation: \{[^\n]+phone_ui:/);
});

test('independent conversations and documents survive normalization and player overrides', () => {
  const seed={contacts:[{id:'a',name:'小夏'},{id:'a',name:'duplicate'}],
    threads:[{id:'group',participants:['a'],messages:[{senderId:'a',text:'群聊'}]}],
    photos:[{id:'photo',src:'assets/rain.jpg',caption:'雨夜'},{id:'bad',src:'javascript:alert(1)'}],
    notes:[{id:'memo',title:'待辦',text:'<script>literal</script>'}],apps:['notes','photos','unknown','notes'],
    storyTime:'23:17',storyDate:'大燁三年',locale:'ja-JP'};
  const config=Core.normalize(seed);
  assert.equal(config.contacts.length,1);
  assert.equal(config.threads[0].messages[0].senderId,'a');
  assert.equal(config.photos.length,1);
  assert.equal(config.notes[0].text,'<script>literal</script>');
  assert.deepEqual(config.apps,['notes','photos']);
  assert.deepEqual(Core.normalize({apps:[]}).apps,Core.allowedApps);
  assert.ok(Core.normalize({}).apps.includes('photos'));
  assert.deepEqual(Core.normalize(config),config);
  const player=require('../js/phone-player-core.js');
  const state={phoneSurface:{version:1,enabled:true,data:seed}};
  const resolved=player.resolve({chat:[{text:'原作'}]},state);
  assert.equal(resolved.chat[0].text,'原作');
  assert.equal(resolved.threads[0].id,'group');
  assert.equal(resolved.notes[0].title,'待辦');
  assert.equal(resolved.storyTime,'23:17');
});

test('photo data URLs are preserved within the media limit without being cut mid-image',()=>{
  const src='data:image/png;base64,'+'A'.repeat(3000);
  assert.equal(Core.normalize({photos:[{id:'p',src}]}).photos[0].src,src);
  assert.equal(Core.media('https://example.com/'+'x'.repeat(3000)), '');
});
