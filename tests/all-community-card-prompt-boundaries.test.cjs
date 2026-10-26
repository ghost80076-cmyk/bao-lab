'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const communityRoot = path.join(root, 'data', 'characters', 'community');

const files = [];
for (const bucket of fs.readdirSync(communityRoot)) {
  const bucketPath = path.join(communityRoot, bucket);
  if (!fs.statSync(bucketPath).isDirectory()) continue;
  for (const name of fs.readdirSync(bucketPath)) {
    if (!name.endsWith('.json') || name.endsWith('.regex.json')) continue;
    files.push(path.join(bucketPath, name));
  }
}

assert.equal(files.length, JSON.parse(fs.readFileSync(path.join(root, 'data/character-catalog/community/manifest.json'), 'utf8')).total, 'formal cards must match catalog total');

const implementationJargon = /Builder|Gameplay UI|Dynamic Prompts|Author Regex|作者 Regex|\bRegex\b|Persona|原生 Gameplay UI|原生狀態 UI|夜灣原生 UI/;
const duplicatePlatformRules = /不得替玩家|不能替玩家|不替玩家|玩家控制權是硬規則|作品名稱[^\n]*(?:不是|不得)[^\n]*(?:NPC|人物)/;
const runtimePlatformGate = /啟用成人模式|啟用成人內容|成人顯示已啟用|開啟成人內容/;
const agePolicyBoilerplate = /(?:所有|全部|全體)[^\n]{0,50}(?:18\s*\+|18\s*歲|成年人?|成年)|(?:成人內容|成人親密)[^\n]{0,60}(?:啟用成人模式|只在玩家已啟用)|原稿\s*17\s*歲[^\n]*改為\s*20\s*歲/;

for (const file of files) {
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  const modelText = [
    card.content?.system_prompt || '',
    card.content?.author_instructions || '',
    card.content?.npc_rules || '',
    ...(card.content?.dynamic_prompts || []).map(item => item.text || '')
  ].join('\n');

  assert.doesNotMatch(modelText, implementationJargon, `${card.meta?.id || file} leaks platform implementation jargon to the model`);
  assert.doesNotMatch(modelText, duplicatePlatformRules, `${card.meta?.id || file} repeats platform-global control/entity rules`);
  assert.doesNotMatch(modelText, runtimePlatformGate, `${card.meta?.id || file} leaks platform adult-mode gating into Runtime Prompt`);
  if (['spirit-campus-triangle','light-energy-celebrity-agency','fusion-world-entertainment-empire'].includes(card.meta?.id)) {
    assert.doesNotMatch(modelText, agePolicyBoilerplate, `${card.meta?.id || file} leaks age/rating policy boilerplate into Runtime Prompt`);
  }
}


const extraRoots = [
  path.join(root, 'data', 'characters', 'general'),
  path.join(root, 'data', 'characters', 'male')
];
const extraFiles = [];
for (const dir of extraRoots) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name.endsWith('.regex.json')) continue;
    extraFiles.push(path.join(dir, name));
  }
}
for (const file of extraFiles) {
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  const modelText = [
    card.content?.system_prompt || '',
    card.content?.author_instructions || '',
    card.content?.npc_rules || '',
    ...(card.content?.dynamic_prompts || []).map(item => item.text || '')
  ].join('\n');
  assert.doesNotMatch(modelText, runtimePlatformGate, `${card.meta?.id || file} leaks platform adult-mode gating into Runtime Prompt`);
}

const engine = fs.readFileSync(path.join(root, 'js', 'character.js'), 'utf8');
assert.match(engine, /controlled_by=user/);
assert.match(engine, /未提供明確授權時，不補寫玩家未輸入的台詞、心理、意圖或主動行動/);
assert.match(engine, /任何演繹授權都不得代作玩家的重大承諾、關係定案、同意或不可逆選擇/);
assert.match(engine, /結構化初始狀態若已提供/);
assert.match(engine, /狀態模組與介面標籤不是 NPC/);

console.log('PASS formal cards keep platform-global rules and adult-mode gating out of model-bound prompts');
