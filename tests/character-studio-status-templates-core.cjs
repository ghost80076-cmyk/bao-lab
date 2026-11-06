const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../js/character-status-templates.js');
const core = require('../js/character-studio-status-templates-core.js');
const asset = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const ids = ['general','relationship','fantasy','vampire','cultivation','three_realms','combat'];
assert.deepEqual(Object.keys(catalog.TEMPLATES), ids);
assert.strictEqual(core.TEMPLATES, catalog.TEMPLATES, 'author and player must reference the same catalog');
assert(Object.isFrozen(catalog.TEMPLATES));
const relation = catalog.TEMPLATES.relationship.fields;
const affinity = relation.find(f => f.key === 'affinity');
const trust = relation.find(f => f.key === 'trust');
assert.equal(affinity.min, -100);
assert.equal(affinity.max, 100);
assert.equal(trust.min, -100);
assert.equal(trust.max, 100);
assert.equal(catalog.TEMPLATES.general.fields.find(f=>f.key==='energy').context, 'core');
assert.equal(catalog.TEMPLATES.combat.fields.find(f=>f.key==='hp').default, 100);
assert.equal(catalog.TEMPLATES.combat.fields.find(f=>f.key==='hp').type, 'meter');
assert.equal(catalog.TEMPLATES.three_realms.fields.find(f=>f.key==='affinity_description').default, '未確認');
assert(!asset('js/character-status-ui.js').includes('const TEMPLATES = {'), 'player must not retain a second catalog');
assert(!asset('js/character-studio-status-templates-core.js').includes('const PRESETS = '), 'author must not retain old presets');
const main = asset('js/site-ui.js');
assert(main.indexOf('js/character-status-templates.js?v=1') < main.indexOf('js/character-status-ui.js?v=13'), 'player must load the shared catalog first');
const studio = asset('character-studio.html');
assert(studio.indexOf('js/character-status-templates.js?v=1') < studio.indexOf('js/character-studio-status-templates-core.js?v=2'), 'author must load the shared catalog first');

const base = {
  name:'海港世界',world:true,
  character_status:{enabled:false,allow_player_customize:false,own_flag:'preserved',fields:[
    {key:'custom_note',label:'備註',type:'text',default:'無',context:'ui_only',track:false,player_rename:false,description:'原卡資料'}
  ]},
  initial_state:{
    npcs:[{name:'林曼',role:'老師'},{name:'霜',role:'鄰居'}],
    modules:{economy:{coins:300}},
    character_statuses:{'林曼':{custom_note:'擁有鑰匙',preserved_key:'額外值'},'霜':{custom_note:'已離場'}},
    worldbookLibrary:{books:[1]}
  }
};
const untouched = JSON.stringify(base);
assert.deepEqual(core.subjects(base),['林曼','霜']);
assert.equal(core.subjects({...base,name:'作品標題',world:true,initial_state:{npcs:[],character_statuses:{}}}).length,0);
assert.deepEqual(core.subjects({...base,name:'單角色',world:false,initial_state:{npcs:[],character_statuses:{}}}),['單角色']);

const added = core.addPreset(base,'relationship');
assert.equal(added.character_status.enabled,true);
assert.equal(added.character_status.allow_player_customize,false);
assert.equal(added.character_status.own_flag,'preserved');
assert.equal(added.character_status.fields.length,4);
assert.deepEqual(added.initial_state.modules,base.initial_state.modules);
assert.deepEqual(added.initial_state.worldbookLibrary,base.initial_state.worldbookLibrary);
assert.deepEqual(added.initial_state.character_statuses,base.initial_state.character_statuses);
for(const f of relation) assert.deepEqual(
  Object.fromEntries(['key','label','type','context','min','max','default','description'].map(k=>[k,added.character_status.fields.find(x=>x.key===f.key)?.[k]])),
  Object.fromEntries(['key','label','type','context','min','max','default','description'].map(k=>[k,f[k]]))
);
assert.throws(()=>core.addPreset(added,'relationship'),/已經存在/);
assert.throws(()=>core.addPreset(added,'strange'),/找不到/);
assert.equal(core.initialValues(added,'林曼').affinity,0);
assert.deepEqual(core.initialValues(added,'林曼').relationship_state,['未定義']);
const filled = core.setInitialValues(added,'林曼',{affinity:'-73',trust:'25',custom_note:'變更後'});
assert.deepEqual(filled.initial_state.character_statuses['林曼'],{
  custom_note:'變更後',preserved_key:'額外值',affinity:-73,trust:25
});
assert.deepEqual(filled.initial_state.character_statuses['霜'],{custom_note:'已離場'});
assert.equal(added.initial_state.character_statuses['林曼'].affinity,undefined);
assert.throws(()=>core.setInitialValues(filled,'林曼',{affinity:'-101'}),/範圍/);
assert.throws(()=>core.setInitialValues(filled,'林曼',{affinity:'not-a-number'}),/有限數字/);
assert.throws(()=>core.setInitialValues(filled,'假人物',{affinity:'50'}),/請先/);
assert.throws(()=>core.setInitialValues(filled,'林曼',{unknown:'50'}),/欄位已變更/);
const combat = core.addPreset(filled,'combat');
assert.equal(core.initialValues(combat,'霜').hp,100);
assert.equal(combat.character_status.fields.length,8);
const general = core.addPreset(combat,'general');
assert.equal(core.initialValues(general,'霜').energy,100);
assert.equal(general.character_status.fields.find(f=>f.key==='energy').context,'core');
const partial = core.addPreset({
  ...base,character_status:{...base.character_status,fields:[...base.character_status.fields,affinity]}
},'relationship');
assert.equal(partial.character_status.fields.filter(f=>f.key==='affinity').length,1);
assert.equal(partial.character_status.fields.find(f=>f.key==='affinity').min,-100);
assert.equal(partial.character_status.fields.length,4);
const almostFull = {...base,character_status:{fields:Array.from({length:23},(_,i)=>({key:'f'+i}))}};
assert.throws(()=>core.addPreset(almostFull,'relationship'),/24 個/);
assert.equal(almostFull.character_status.fields.length,23);
for(const id of ids) {
  const tpl = catalog.TEMPLATES[id];
  const result = core.addPreset({...base,character_status:{fields:[]}},id);
  assert.deepEqual(result.character_status.fields.map(x=>x.key),tpl.fields.map(x=>x.key));
  for(const field of result.character_status.fields) {
    const source = tpl.fields.find(x=>x.key===field.key);
    assert.deepEqual(field.default,source.default);
    assert.equal(field.min,source.min);
    assert.equal(field.max,source.max);
    assert.equal(field.context,source.context);
  }
}
const custom = core.upsertField(general,{
  key:'morale',label:'士氣',type:'number',min:'-10',max:'10',default:'2',track:true,context:'core',description:'有明確事件時才更改。'
});
const morale = custom.character_status.fields.find(f=>f.key==='morale');
assert.deepEqual([morale.min,morale.max,morale.default],[-10,10,2]);
assert.throws(()=>core.upsertField(custom,{...morale,key:'changed'},'morale'),/勿直接更名/);
assert.throws(()=>core.upsertField(custom,{...morale,key:'affinity'},'morale'),/勿直接更名/);
assert.throws(()=>core.upsertField(custom,{...morale,key:'affinity'},''),/已存在/);
assert.throws(()=>core.upsertField(custom,{...morale,min:11,max:10},'morale'),/最小值/);
assert.throws(()=>core.upsertField(custom,{...morale,default:999},'morale'),/預設值/);
const bool = core.upsertField(custom,{key:'has_pass',label:'持有通行證',type:'boolean',context:'ui_only',track:false,default:'true'});
const tagged = core.upsertField(bool,{key:'traits',label:'標籤',type:'tags',context:'relevant',track:true,default:'內向、勇敢'});
const typed = core.setInitialValues(tagged,'霜',{has_pass:'false',traits:'謹慎、調查中'});
assert.equal(typed.initial_state.character_statuses['霜'].has_pass,false);
assert.deepEqual(typed.initial_state.character_statuses['霜'].traits,['謹慎','調查中']);
const without = core.removeField(typed,'morale');
assert.equal(without.character_status.fields.some(f=>f.key==='morale'),false);
assert.equal(without.initial_state.character_statuses['林曼'].preserved_key,'額外值');
assert.equal(JSON.stringify(base),untouched,'incoming card is never mutated');
assert.throws(()=>core.upsertField({...base,character_status:{fields:Array.from({length:24},(_,i)=>({key:'x'+i}))}},{key:'extra',label:'額外',type:'meter',default:0,context:'core'}),/最多 24/);
assert.throws(()=>core.upsertField(base,{key:'中文',label:'不合法',type:'number',default:0,context:'core'}),/key/);
assert.throws(()=>core.upsertField({...base,character_status:{fields:[{key:'a'},{key:'a'}]}},{key:'b',label:'B',type:'text',default:'',context:'core'}),/重複/);
console.log('Shared seven status templates + creator initial status core: OK');
