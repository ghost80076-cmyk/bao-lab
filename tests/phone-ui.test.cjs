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
  assert.ok(main.indexOf('js/phone-ui-core.js') < main.indexOf('js/character.js'));
  assert.ok(main.indexOf('js/phone-ui.js') > main.indexOf('js/app.js'));
  assert.ok(studio.indexOf('js/phone-ui-core.js') < studio.indexOf('js/character.js'));
  assert.match(character,/phone_ui:.*phoneUI/s);
  assert.match(editor,/phone_ui: readPhoneUI\(\)/);
  assert.match(editor,/presentation: \{[^\n]+phone_ui:/);
});
