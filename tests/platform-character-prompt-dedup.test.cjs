'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const cards = [
  'data/characters/community/e7/elze-survival-world.json',
  'data/characters/community/bc/xinglan-academy.json',
  'data/characters/community/a9/lu-jingchen-cold-shell-desire.json',
  'data/characters/community/64/sakura-house-experience-management.json',
  'data/characters/community/bf/medieval-guild-dynasty-simulator.json',
  'data/characters/community/22/nangong-wen-runaway-bride.json',
  'data/characters/community/b8/heart-training-boyfriend-plan.json',
  'data/characters/community/fb/taiwan-food-hunter.json',
  'data/characters/community/5d/han-seoyeon-seven-day-contract-lover.json',
  'data/characters/community/8f/weird-task-system.json',
  'data/characters/community/c4/lin-qiaorou-always-nearby.json',
  'data/characters/community/94/pheromone-bond-abo-simulator.json',
  'data/characters/community/d6/collar-class-f-to-s.json'
];

const implementationJargon = /Builder|Gameplay UI|Dynamic Prompts|Author Regex|作者 Regex|\bRegex\b|Persona|原生 UI|原生 Gameplay UI/;
const duplicateHeadings = /【(?:玩家控制權|玩家控制邊界|玩家視角與資訊隔離|原生狀態 UI|原生 Gameplay UI|夜灣原生 UI)】/;

for (const relative of cards) {
  const card = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const modelText = [
    card.content?.system_prompt || '',
    card.content?.author_instructions || '',
    card.content?.npc_rules || '',
    ...(card.content?.dynamic_prompts || []).map(item => item.text || '')
  ].join('\n');

  assert.doesNotMatch(modelText, implementationJargon, `${card.meta.id} must not send platform implementation jargon to the story model`);
  assert.doesNotMatch(modelText, duplicateHeadings, `${card.meta.id} must rely on platform-global player/control/display rules`);
}

const characterEngine = fs.readFileSync(path.join(root, 'js/character.js'), 'utf8');
assert.match(characterEngine, /玩家資料、開局選項與結構化初始狀態若已提供/);

const relevance = fs.readFileSync(path.join(root, 'js/world-relevance.js'), 'utf8');
assert.match(relevance, /compactForPrompt\(\)/);
assert.match(relevance, /【目前核心狀態】/);
assert.doesNotMatch(relevance, /return prompt;\\n\\n/);

const medieval = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/bf/medieval-guild-dynasty-simulator.json'), 'utf8'));
assert.match(medieval.content.system_prompt, /rival_strategy/);
assert.match(medieval.content.system_prompt, /職業不是標籤/);

const abo = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/94/pheromone-bond-abo-simulator.json'), 'utf8'));
assert.match(abo.content.system_prompt, /信息素不是魔法讀心/);
assert.match(abo.content.system_prompt, /ABO 資訊邊界/);

const qiaorou = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/c4/lin-qiaorou-always-nearby.json'), 'utf8'));
assert.match(qiaorou.content.system_prompt, /監控不是超能力/);
assert.match(qiaorou.content.system_prompt, /讀者視角/);

const weird = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/8f/weird-task-system.json'), 'utf8'));
assert.match(weird.content.system_prompt, /普通人不會知道系統任務內容/);

const food = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/fb/taiwan-food-hunter.json'), 'utf8'));
assert.match(food.content.system_prompt, /birthplace 決定第一幕所在縣市/);

const basicTemplate = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/character-basic-template.json'), 'utf8'));
assert.doesNotMatch(basicTemplate.content.author_instructions, /不得替玩家|Builder|Gameplay UI/);

console.log('PASS platform/card prompt responsibilities are deduplicated without removing story-specific mechanics');
