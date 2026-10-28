const assert = require('node:assert/strict');
const Stage = require('../js/stage-capability-core.js');

const readerDesktop = Stage.resolve({ viewport:'desktop' });
assert.equal(readerDesktop.shell, 'reader');
assert.equal(readerDesktop.renderer, 'reader-context');
assert.equal(readerDesktop.presentation, 'sheet');
assert.equal(readerDesktop.controls, 'bao-reader-context');
assert.deepEqual(readerDesktop.available, ['reader']);

const readerMobile = Stage.resolve({ viewport:'mobile' });
assert.equal(readerMobile.shell, 'reader');
assert.equal(readerMobile.renderer, 'game-ui');
assert.equal(readerMobile.presentation, 'panel');
assert.equal(readerMobile.controls, 'game-ui');

const readerCompact = Stage.resolve({ viewport:'compact' });
assert.equal(readerCompact.shell, 'reader');
assert.equal(readerCompact.renderer, 'game-ui');
assert.equal(readerCompact.presentation, 'panel');

const standard = Stage.resolve({
  viewport:'desktop',
  gameplay:{ layout:{preset:'standard'}, panels:[{id:'status'}] }
});
assert.equal(standard.shell, 'gameplay');
assert.equal(standard.renderer, 'game-ui');
assert.equal(standard.presentation, 'panel');
assert.equal(standard.gameplayPreset, 'standard');

const dashboard = Stage.resolve({
  viewport:'desktop',
  gameplay:{ layout:{preset:'rpg-dashboard',left_panel:'left',right_panel:'right'}, panels:[{id:'left'},{id:'right'}] }
});
assert.equal(dashboard.shell, 'rpg-dashboard');
assert.equal(dashboard.renderer, 'game-ui');
assert.equal(dashboard.presentation, 'embedded');
assert.equal(dashboard.persistent, true);

const scene = Stage.resolve({
  viewport:'desktop',
  gameplay:{ layout:{preset:'scene-rpg'}, panels:[{id:'right'}] }
});
assert.equal(scene.shell, 'scene-rpg');
assert.equal(scene.presentation, 'embedded');

const terminal = Stage.resolve({
  viewport:'desktop',
  gameplay:{ layout:{preset:'terminal', primary_panel:'system'}, panels:[{id:'system'}] }
});
assert.equal(terminal.shell, 'terminal');
assert.equal(terminal.renderer, 'game-ui');
assert.equal(terminal.presentation, 'embedded');
assert.equal(terminal.persistent, true);
assert.equal(terminal.label, '終端舞臺');

const terminalCompact = Stage.resolve({
  viewport:'compact',
  gameplay:{ layout:{preset:'terminal', primary_panel:'system'}, panels:[{id:'system'}] }
});
assert.equal(terminalCompact.shell, 'terminal');
assert.equal(terminalCompact.presentation, 'panel');
assert.equal(terminalCompact.persistent, false);

const optionalPhone = Stage.resolve({ viewport:'desktop', phone:true });
assert.equal(optionalPhone.shell, 'reader');
assert.deepEqual(optionalPhone.available, ['reader','phone']);
assert.equal(optionalPhone.phoneAvailable, true);

const explicitPhone = Stage.resolve({ viewport:'mobile', phone:true, preferred:'phone' });
assert.equal(explicitPhone.shell, 'phone');
assert.equal(explicitPhone.renderer, 'phone');
assert.equal(explicitPhone.presentation, 'overlay');
assert.equal(explicitPhone.source, 'explicit');
assert.equal(explicitPhone.controls, 'bao-phone-stage');

const missingExplicitPhone = Stage.resolve({ viewport:'desktop', phone:false, preferred:'phone' });
assert.equal(missingExplicitPhone.shell, 'reader');
assert.equal(missingExplicitPhone.source, 'default');

const legacyGameUI = Stage.resolve({ viewport:'desktop', preferred:'game-ui' });
assert.equal(legacyGameUI.shell, 'gameplay');
assert.equal(legacyGameUI.gameplayAvailable, true);
assert.equal(legacyGameUI.source, 'explicit');

const phoneDoesNotOverrideGameplay = Stage.resolve({
  viewport:'desktop',
  phone:true,
  gameplay:{ layout:{preset:'rpg-dashboard'}, panels:[{id:'left'}] }
});
assert.equal(phoneDoesNotOverrideGameplay.shell, 'rpg-dashboard');
assert.deepEqual(phoneDoesNotOverrideGameplay.available, ['reader','rpg-dashboard','phone']);

assert.equal(Stage.shells.includes('terminal'), true);
assert.equal(Stage.shells.includes('phone'), true);
assert.equal(Stage.version, 1);

console.log('Stage capability core: OK');
// Actual screen width, not just desktop/mobile, determines persistent shells.
for (const [preset, threshold] of [['terminal',1081],['scene-rpg',1280],['rpg-dashboard',1430]]) {
  const gameplay={layout:{preset,left_panel:'status'},panels:[{id:'status'}]};
  const below=Stage.resolve({viewport:'desktop',width:threshold-1,gameplay});
  const at=Stage.resolve({viewport:'desktop',width:threshold,gameplay});
  assert.equal(below.presentation,'panel');
  assert.equal(below.controls,'game-ui');
  assert.equal(at.presentation,'embedded');
  assert.notEqual(at.controls,'game-ui');
}
assert.equal(Stage.resolve({viewport:'desktop',width:1600,gameplay:{layout:{preset:'rpg-dashboard'},panels:[{id:'status'}]}}).presentation,'panel');
