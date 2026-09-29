'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('character-studio.html','utf8');
const studio=fs.readFileSync('js/character-studio.js','utf8');

assert.match(html,/name="gameplay_theme"/,'Character Studio should expose a gameplay theme preset selector');
assert.match(html,/name="gameplay_accent"/,'Character Studio should expose a safe accent color control');
assert.match(html,/gameplay-ui-core\.js\?v=2/,'Character Studio should load the shared gameplay theme sanitizer');
assert.match(studio,/normalizeTheme/,'Character Studio should normalize author theme choices through Gameplay UI core');
assert.match(studio,/ui_schema:\s*c\.gameplay_ui/,'Character Studio exports must preserve Gameplay UI schema');
assert.match(studio,/syncGameplayThemeControls\(Boolean\(c\.gameplay_ui\)\)/,'theme controls should only activate for cards that already have Gameplay UI');
console.log('Character Studio gameplay theme PASS: safe controls and ui_schema export are preserved');
