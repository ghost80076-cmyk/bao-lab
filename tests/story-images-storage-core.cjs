const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {Database} = require('./storage-multitab-core.cjs');
const read = file => fs.readFileSync(require('node:path').join(__dirname,'../js',file),'utf8');
const image = {version:1,width:1,height:1,data:'data:image/png;base64,aGVsbG8='};
function tab(db) {
  const c={structuredClone,console:{warn(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
  c.window=c;vm.createContext(c);
  vm.runInContext(read('story-images-core.js'),c);
  vm.runInContext(read('storage.js').replace(/Storage\.init\(\);\s*$/,'')+'\nwindow.Storage=Storage;',c);
  vm.runInContext(read('story-library.js'),c);
  c.BAOStoryLibrary._db=db;c.BAOStoryLibrary.open=async()=>db;c.Storage.saveStory=()=>true;
  return c;
}
(async()=>{
  const db=new Database(),a=tab(db),lib=a.BAOStoryLibrary;
  const payload={characterId:'hero',config:{api:{key:'SECRET'}},state:{},savedAt:'2026-11-24T00:00:00Z',
    _library:{storyId:'image-story',chapterId:'root'},chat:{messages:[
      {id:'player',role:'user',content:'Only A sees this.',storyImage:image},
      {id:'reply',role:'assistant',content:'A notices a door.'}]}};
  await lib.persist(payload);
  const fresh=tab(db);
  let restored=await fresh.BAOStoryLibrary.reconstruct('image-story','root');
  assert.deepEqual(JSON.parse(JSON.stringify(restored.chat.messages[0].storyImage)),image);
  const exported=JSON.stringify(restored);
  const imported=a.Storage.sanitizeImportedStory(JSON.parse(exported));
  assert.equal(imported.chat.messages[0].storyImage.data,image.data);
  assert.equal(exported.includes('SECRET'),false);
  lib.adoptRefs(payload);
  const branch=await lib.createBranch('reply','with photo');
  assert.equal(branch.chat.messages[0].storyImage.data,image.data);
  branch.chat.messages[0].content='branch-only change';
  await lib.persist(branch);
  assert.equal((await lib.reconstruct('image-story','root')).chat.messages[0].content,'Only A sees this.');
  const other=structuredClone(payload);other._library={storyId:'other-story',chapterId:'root'};delete other.chat.messages[0].storyImage;
  await lib.persist(other);
  assert.equal((await lib.reconstruct('other-story','root')).chat.messages[0].storyImage,undefined);
  const bad=structuredClone(payload);bad.chat.messages[0].storyImage.data='https://remote.test/image';
  assert.throws(()=>a.Storage.sanitizeImportedStory(bad));
  assert.equal((await lib.reconstruct('image-story','root')).chat.messages[0].storyImage.data,image.data);
  // Unknown optional metadata stays portable without any DB/schema migration.
  restored=await tab(db).BAOStoryLibrary.reconstruct('image-story',branch._library.chapterId);
  assert.equal(restored.chat.messages[0].storyImage.data,image.data);
  console.log('Story images storage: real message records, fresh reload, portable JSON, branch isolation and invalid import rejection passed');
})().catch(error=>{console.error(error);process.exitCode=1});
