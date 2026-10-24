'use strict';
const assert = require('node:assert/strict');
const core = require('../js/settings-effects-core.js');
const row = (id, state, expected=[], target='system') => ({id,label:id,group:'group',value:'on',scope:'本故事',source:'故事',state,expected,target});
const rows = [row('style','ready',['STYLE']),row('observe','conditional',['OBSERVE'],'latest'),
  row('off','off'),row('length','replaced'),row('custom','excluded'),row('display','display'),row('default','inherited'),row('task','configured'),
  {...row('lore','conditional',[],'current'),anyExpected:['FIXED_LORE','DYNAMIC_LORE']}];
const before = JSON.stringify(rows);
let captured = core.capture(rows,[{role:'system',content:'STYLE FIXED_LORE'},{role:'user',content:'go'}]);
assert.equal(captured[0].evidence,'included');
assert.equal(captured[1].evidence,'conditional');
assert.equal(captured.at(-1).evidence,'included');
assert.equal(core.capture(rows,[{role:'user',content:'STYLE OBSERVE'}])[0].evidence,'missing','user cannot spoof a system preference');
assert.equal(core.capture(rows,[{role:'user',content:'OBSERVE'},{role:'assistant',content:'x'},{role:'user',content:'go'}])[1].evidence,'conditional','past observer marker is not current authorization');
assert.equal(core.capture(rows,[{role:'user',content:'OBSERVE'}])[1].evidence,'included');
assert.equal(core.capture(rows,[{role:'user',content:'DYNAMIC_LORE'}]).at(-1).evidence,'included');
assert.equal(core.capture(rows,[{role:'assistant',content:'DYNAMIC_LORE'},{role:'user',content:'go'}]).at(-1).evidence,'conditional','history is not current lore inclusion');
assert.equal(core.compare(rows)[0].evidence,'unknown');
assert.equal(core.compare(rows,captured)[0].evidence,'included');
const changed = rows.map(r=>({...r}));changed[0].value='other';
assert.equal(core.compare(changed,captured)[0].evidence,'changed');
assert.equal(core.compare(rows,captured)[3].evidence,'replaced');
assert.equal(JSON.stringify(rows),before);
assert.ok(!('expected' in captured[0]),'capture retains only evidence and the comparison stamp');
console.log('PASS current/system-only evidence, trigger/override/display states, changed selections and read-only diagnostics');
