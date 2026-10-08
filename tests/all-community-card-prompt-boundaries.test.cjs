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
}

const engine = fs.readFileSync(path.join(root, 'js', 'character.js'), 'utf8');
assert.match(engine, /controlled_by=user/);
assert.match(engine, /不得生成玩家的新台詞/);
assert.match(engine, /結構化初始狀態若已提供/);
assert.match(engine, /狀態模組與介面標籤不是 NPC/);

console.log('PASS all catalog community cards keep platform-global rules out of model-bound card prompts');
