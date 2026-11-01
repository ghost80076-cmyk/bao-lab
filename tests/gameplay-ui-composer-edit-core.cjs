const assert=require('node:assert/strict');
const Edit=require('../js/gameplay-ui-composer-edit-core.js');
const Core=require('../js/gameplay-ui-core.js');
let ui={version:1,builder:{future:{keep:true}},theme:{preset:'noir',future:1},future:{keep:'yes'},layout:{preset:'rpg-dashboard',left_panel:'left',right_panel:'right'},panels:[
 {id:'left',label:'左',future:1,sections:[{type:'meters',items:[{label:'HP',value_path:'modules.player.hp'}],future:{keep:true}}]},
 {id:'right',label:'右',sections:[{type:'actions',items:[{label:'買',effect:{changes:[{path:'modules.gold.amount',delta:-1}]},future:2}]}]}
]};
const before=structuredClone(ui);
const apply=(type,path,extra={})=>Edit.apply(ui,{type,path,...extra},Core);
let result=apply('move',['panels',1],{to:0});
assert.deepEqual(ui,before,'edits never mutate source');
assert.equal(result.ui.panels[0].id,'right');
assert.equal(result.ui.layout.left_panel,'left');
result=apply('copy',['panels',0]);
assert.notEqual(result.ui.panels[1].id,'left');
assert.deepEqual(result.ui.panels[1].sections,ui.panels[0].sections);
assert.deepEqual(result.ui.builder,ui.builder);
assert.deepEqual(result.ui.theme,ui.theme);
result=apply('set',['panels',0],{key:'id',value:'renamed'});
assert.equal(result.ui.layout.left_panel,'renamed');
assert.throws(()=>apply('set',['panels',0],{key:'id',value:'right'}),/已存在/);
assert.throws(()=>apply('set',['panels',0],{key:'id',value:'__proto__'}),/ID/);
result=apply('remove',['panels',0]);
assert.equal(result.ui.layout.left_panel,undefined);
assert.equal(result.ui.layout.right_panel,'right');
assert.deepEqual(result.ui.future,ui.future);
result=apply('set',['panels',1,'sections',0,'items',0],{key:'label',value:'購買'});
assert.deepEqual(result.ui.panels[1].sections[0].items[0].effect,ui.panels[1].sections[0].items[0].effect);
assert.equal(result.ui.panels[1].sections[0].items[0].future,2);
for(const type of Edit.TYPES.filter(t=>t!=='tabs')){
 result=apply('add-section',['panels',0],{sectionType:type});
 assert.ok(Core.normalizeSection(result.ui.panels[0].sections[1],1));
}
assert.throws(()=>apply('set',['builder',0],{key:'label',value:'bad'}));
assert.throws(()=>apply('move',['panels',0],{to:20}));
const many={version:1,panels:Array.from({length:Core.MAX_PANELS},(_,i)=>({id:'p'+i,sections:[]}))};
assert.throws(()=>Edit.apply(many,{type:'add-panel'},Core),/上限/);
assert.throws(()=>Edit.apply(many,{type:'copy',path:['panels',0]},Core),/上限/);
const empty=Edit.apply(null,{type:'enable'},Core).ui;
assert.deepEqual(empty,{version:1,enabled:true,panels:[]});
assert.equal(Core.normalize(empty),null,'empty drafts remain editable until a section is added');
const panel=Edit.apply(empty,{type:'add-panel'},Core);
assert.deepEqual(panel.selection,['panels',0]);
console.log('Gameplay UI edit core PASS: immutable edits, limits, reference cleanup, unknown fields, effects and draft-only enablement');

assert.equal(Edit.apply({...before,enabled:false},{type:'enable'},Core).ui.enabled,true);
// Tabs retain references and unknown child data through editing, copying and removal.
{
 let source={version:1,panels:[{id:'p',sections:[{type:'tabs',default_tab:'one',future:1,tabs:[{id:'one',label:'一',future:2,sections:[{type:'timeline',mode:'round_diff',items:[],future:3}]}]}]}]};
 const tp=['panels',0,'sections',0,'tabs',0],cp=tp.concat('sections',0);
 const run=(command)=>Edit.apply(source,command,Core);
 const renamed=run({type:'set',path:tp,key:'id',value:'renamed'});
 assert.equal(renamed.ui.panels[0].sections[0].default_tab,'renamed');assert.equal(source.panels[0].sections[0].default_tab,'one');
 assert.throws(()=>run({type:'add-section',path:tp,sectionType:'tabs'}),/不能/);
 let next=run({type:'add-item',path:cp});assert.equal(next.ui.panels[0].sections[0].tabs[0].sections[0].items.length,1);assert.equal(next.ui.panels[0].sections[0].tabs[0].sections[0].future,3);
 next=run({type:'copy',path:tp});assert.equal(next.ui.panels[0].sections[0].tabs.length,2);assert.notEqual(next.ui.panels[0].sections[0].tabs[1].id,'one');assert.equal(next.ui.panels[0].sections[0].tabs[1].future,2);
 next=run({type:'remove',path:tp});assert.equal(next.ui.panels[0].sections[0].default_tab,undefined);
 assert.throws(()=>run({type:'set',path:cp,key:'mode',value:'unknown'}),/支援/);
 source.panels[0].sections[0].tabs=Array.from({length:Core.MAX_TABS},(_,i)=>({id:'t'+i,sections:[]}));
 assert.throws(()=>run({type:'add-tab',path:['panels',0,'sections',0]}),/上限/);
 assert.throws(()=>run({type:'copy',path:tp}),/上限/);
}
