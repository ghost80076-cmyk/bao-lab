const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/world-director-core.js');
const fixture = () => ({worldClock:{tickMinutes:80, scheduledEvents:[
  {id:'wc-1',label:'港口交貨',status:'pending',dueTickMinutes:60},
  {id:'wc-2',label:'午夜碰面',status:'pending',dueTickMinutes:100},
  {id:'wc-3',label:'已取消活動',status:'cancelled',dueTickMinutes:30}
]}});
test('only due pending events appear as non-executing review candidates', () => {
  const s=fixture(), frozen=JSON.stringify(s);
  assert.deepEqual(core.plan(s).map(x=>x.eventId),['wc-1']);
  assert.equal(core.plan(s)[0].action,'review');
  assert.equal(JSON.stringify(s), frozen);
});
test('no implicit clock or event invention', () => {
  assert.deepEqual(core.plan({}),[]);
  assert.deepEqual(core.plan({worldClock:{tickMinutes:-1,scheduledEvents:[]}}),[]);
});
test('unknown and already closed event resolution rejected', () => {
  assert.equal(core.reviewClockPatch(fixture(),{resolve:['wc-999']}).safe,false);
  assert.equal(core.reviewClockPatch(fixture(),{cancel:['wc-3']}).safe,false);
  assert.equal(core.reviewClockPatch(fixture(),{resolve:['wc-1'],cancel:['wc-1']}).safe,false);
});
test('valid resolution still needs evidence and does not mutate state', () => {
  const s=fixture(), b=JSON.stringify(s);
  const review=core.reviewClockPatch(s,{world_clock:{resolve:['wc-1']}});
  assert.equal(review.safe,true);assert.equal(review.requiresReview,true);
  assert.equal(core.reviewClockPatch(s,{resolve:['wc-1']},{evidenceIds:['m-12']}).requiresReview,false);
  assert.equal(JSON.stringify(s),b);
});
test('backward time and re-opening terminal event are contradictions', () => {
  const before=fixture(); before.worldClock.scheduledEvents[2].status='resolved';
  const after=JSON.parse(JSON.stringify(before)); after.worldClock.tickMinutes=72;
  after.worldClock.scheduledEvents[2].status='pending';
  assert.deepEqual(core.compare(before,after).map(x=>x.code),['clock-regression','closed-event-reopened']);
});
test('missing pending events require review; trimmed closed history does not', () => {
  const before=fixture(); const after=fixture();
  after.worldClock.scheduledEvents=after.worldClock.scheduledEvents.filter(x=>x.id==='wc-3');
  assert.deepEqual(core.compare(before,after).map(x=>x.eventId),['wc-1','wc-2']);
});
