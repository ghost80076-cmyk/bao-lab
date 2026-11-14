const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
function runtime(fail = {}) {
  const requests = [];
  const context = { console, window:{addEventListener(){}}, fetch:async file => {
    requests.push(file);
    if (fail[file]) { fail[file]--; return {ok:false,status:503}; }
    return {ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};
  }};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8')+';globalThis.app=App',context);
  context.app.renderCharacters=()=>{};
  return {app:context.app,requests};
}
test('initial metadata is partial; complete search shares page requests and never fetches full cards',async()=>{
  const {app,requests}=runtime();
  await app.loadCharacters();
  assert.equal(app.characters.length,38);
  assert.equal(app.characters.some(x=>x.id==='unread-afterglow-seoul'),false);
  await Promise.all([app.ensureCompleteCharacterCatalog(),app.ensureCompleteCharacterCatalog(),app.loadMoreCharacters()]);
  assert.equal(app.characters.length,75);
  assert.equal(app.characters.filter(x=>x.id==='unread-afterglow-seoul').length,1);
  assert.equal(app.hasMoreCharacterCatalog(),false);
  assert.equal(requests.filter(x=>x.includes('page-0001')).length,1);
  assert.ok(requests.every(x=>x==='data/characters.json'||x.startsWith('data/character-catalog/')));
  const before=requests.length;
  await app.ensureCompleteCharacterCatalog();
  assert.equal(requests.length,before);
});
for(const file of ['data/character-catalog/community/manifest.json','data/character-catalog/community/page-0002.json','data/character-catalog/community/page-0001.json']){
  test('failure preserves retryable catalog state: '+file,async()=>{
    const {app,requests}=runtime({[file]:1});
    await app.loadCharacters();
    if(file.includes('0001'))await assert.rejects(app.ensureCompleteCharacterCatalog());
    assert.equal(app.hasMoreCharacterCatalog(),true);
    await app.ensureCompleteCharacterCatalog();
    assert.equal(app.characters.length,75);
    assert.equal(app.hasMoreCharacterCatalog(),false);
    assert.equal(requests.filter(x=>x===file).length,2);
  });
}
test('metadata loading preserves local work identity and on-demand full-card loading',async()=>{
  const {app,requests}=runtime();await app.loadCharacters();
  const local={id:'unread-afterglow-seoul',source:'local-import',name:'local override'};
  app.characters.unshift(local);
  await app.ensureCompleteCharacterCatalog();
  assert.equal(app.characters.find(x=>x.id===local.id),local);
  assert.equal(await app.loadCharacter(local.id),local);
  await app.loadCharacter('night-sky-magic-academy');
  assert.equal(requests.filter(x=>x.startsWith('data/characters/')).length,1);
});
