const assert = require('node:assert/strict');
const core = require('../js/character-studio-status-templates-core.js');
const base = {
  name: '海港世界', world: true,
  character_status: { enabled:false, allow_player_customize:false, own_flag:'preserved', fields:[
    { key:'custom_note', label:'備註', type:'text', default:'無', context:'ui_only', track:false, player_rename:false, description:'原卡資料' }
  ] },
  initial_state: {
    npcs:[{name:'林曼',role:'老師'},{name:'霜',role:'鄰居'}],
    modules:{economy:{coins:300}},
    character_statuses:{'林曼':{custom_note:'擁有鑰匙', preserved_key:'額外值'},'霜':{custom_note:'已離場'}},
    worldbookLibrary:{books:[1]}
  }
};
const untouched = JSON.stringify(base);
assert.deepEqual(core.subjects(base),['林曼','霜']);
assert.equal(core.subjects({...base, name:'作品標題',world:true,initial_state:{npcs:[],character_statuses:{}}}).length,0);
assert.deepEqual(core.subjects({...base, name:'單角色',world:false,initial_state:{npcs:[],character_statuses:{}}}),['單角色']);

const added = core.addPreset(base,'affinity');
assert.equal(added.character_status.enabled,true);
assert.equal(added.character_status.allow_player_customize,false);
assert.equal(added.character_status.own_flag,'preserved');
assert.equal(added.character_status.fields.length,2);
assert.deepEqual(added.initial_state.modules,base.initial_state.modules);
assert.deepEqual(added.initial_state.worldbookLibrary,base.initial_state.worldbookLibrary);
assert.deepEqual(added.initial_state.character_statuses,base.initial_state.character_statuses);
assert.ok(added.character_status.fields.some(f=>f.key==='affinity' && f.type==='meter' && f.context==='relevant'));
assert.throws(()=>core.addPreset(added,'affinity'),/已經存在/);
assert.throws(()=>core.addPreset(added,'strange'),/找不到/);
const initial = core.initialValues(added,'林曼');
assert.equal(initial.affinity,0);
assert.equal(initial.custom_note,'擁有鑰匙');
const filled = core.setInitialValues(added,'林曼',{affinity:'73',custom_note:'變更後'});
assert.deepEqual(filled.initial_state.character_statuses['林曼'],{
  custom_note:'變更後',preserved_key:'額外值',affinity:73
});
assert.deepEqual(filled.initial_state.character_statuses['霜'],{custom_note:'已離場'});
assert.equal(added.initial_state.character_statuses['林曼'].affinity,undefined);
assert.throws(()=>core.setInitialValues(filled,'林曼',{affinity:'101'}),/範圍/);
assert.throws(()=>core.setInitialValues(filled,'林曼',{affinity:'not-a-number'}),/有限數字/);
assert.throws(()=>core.setInitialValues(filled,'假人物',{affinity:'50'}),/請先/);
assert.throws(()=>core.setInitialValues(filled,'林曼',{unknown:'50'}),/欄位已變更/);
const energy = core.addPreset(filled,'energy');
assert.equal(core.initialValues(energy,'霜').energy,100);
const custom = core.upsertField(energy,{
  key:'morale',label:'士氣',type:'number',min:'-10',max:'10',default:'2',track:true,context:'core',description:'有明確事件時才更改。'
});
assert.equal(custom.character_status.fields.length,4);
const morale = custom.character_status.fields.find(f=>f.key==='morale');
assert.deepEqual([morale.min,morale.max,morale.default],[-10,10,2]);
assert.throws(()=>core.upsertField(custom,{...morale,key:'changed'},'morale'),/勿直接更名/);
assert.throws(()=>core.upsertField(custom,{...morale,key:'affinity'}),/已存在/);
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
console.log('Creator initial status templates core: OK');
