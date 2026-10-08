'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const communityRoot = path.join(root, 'data', 'characters', 'community');

function listJson(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJson(full));
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.regex.json')) out.push(full);
  }
  return out;
}

const cardFiles = listJson(communityRoot);
assert.equal(cardFiles.length, JSON.parse(fs.readFileSync(path.join(root, 'data/character-catalog/community/manifest.json'), 'utf8')).total, 'formal cards must match catalog total');

const implementationJargon = /Builder|Gameplay UI|Dynamic Prompts|Author Regex|作者 Regex|\bRegex\b|Persona|原生 UI|原生 Gameplay UI|原生 Game UI|結構化狀態|情境規則|顯示層規則/;
const duplicatePlatformRules = /不得替玩家|不替玩家(?:說話|生成|決定|做決定)|不能替玩家|玩家控制權|玩家主權|玩家只由玩家本人控制|玩家只能控制自己的|作品名稱[^\n]*(?:不是|不得)[^\n]*(?:NPC|人物)|作品標題[^\n]*(?:不是|不得)[^\n]*(?:NPC|人物)/;
const duplicateHeadings = /【(?:玩家控制權|玩家控制邊界|玩家主權|玩家自主|玩家主導權|視角與玩家控制|玩家視角與資訊隔離|視角與資訊隔離|資訊隔離|NPC 自主性|NPC 自主|世界自主運作|原生狀態 UI|原生 Gameplay UI|夜灣原生 UI)】/;

const offenders = [];
for (const filePath of cardFiles) {
  const card = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const modelText = [
    card.content?.system_prompt || '',
    card.content?.author_instructions || '',
    card.content?.npc_rules || '',
    ...(card.content?.dynamic_prompts || []).map(item => item.text || '')
  ].join('\n');

  const hits = [
    ['implementation', modelText.match(implementationJargon)?.[0]],
    ['platform-rule', modelText.match(duplicatePlatformRules)?.[0]],
    ['platform-heading', modelText.match(duplicateHeadings)?.[0]]
  ].filter(([, hit]) => hit);

  for (const [kind, hit] of hits) offenders.push(`${card.meta.id}: ${kind}: ${hit}`);
}
assert.deepEqual(offenders, [], 'model-bound community card prompts must contain only story-specific rules');

const characterEngine = fs.readFileSync(path.join(root, 'js', 'character.js'), 'utf8');
assert.match(characterEngine, /玩家資料、開局選項與結構化初始狀態若已提供/);
assert.match(characterEngine, /不得要求玩家重新填寫、重新選擇或重演建立流程/);
assert.match(characterEngine, /作品名稱、世界名稱、狀態模組與介面標籤不是 NPC/);

const relevance = fs.readFileSync(path.join(root, 'js', 'world-relevance.js'), 'utf8');
assert.match(relevance, /compactForPrompt\(\)/);
assert.match(relevance, /【目前核心狀態】/);

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

console.log('PASS all catalog community cards keep platform-global rules out of model-bound prompts');
