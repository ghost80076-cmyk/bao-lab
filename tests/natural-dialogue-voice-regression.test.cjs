'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const source = read('js/prompt-orchestrator.js');
  const App = {
    config: { api: { type: 'gemini', model: 'gemini-test' } },
    buildMessages: async () => [
      { role: 'system', content: '角色核心' },
      { role: 'user', content: '今天雨好大。' }
    ]
  };
  const window = {};
  vm.runInNewContext(source, { App, window });
  const rules = window.BAOPromptOrchestrator;
  assert.ok(rules.dialogueRealismRule, 'platform dialogue realism rule should be exported');
  assert.match(rules.dialogueRealismRule, /台詞由其自身性格/);
  assert.match(rules.dialogueRealismRule, /不將尊重玩家自主權誤解為 NPC 必須等指令/);

  for (let i = 0; i < 2; i++) {
    const messages = await App.buildMessages(App.config);
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
    assert.equal((system.match(/【人物對話真實性】/g) || []).length, 1, 'no duplicated realism prompt');
    assert.match(system, /不替玩家補寫/);
    assert.match(system, /角色核心/);
    assert.match(messages.at(-1).content, /【本輪】/);
  }

  for (const mode of ['immersive', 'world']) {
    const prompt = JSON.parse(read('data/prompts/' + mode + '.json')).prompt;
    assert.match(prompt, /電影感/);
    assert.match(prompt, /不統一/);
    assert.match(prompt, /NPC/);
    assert.match(prompt, /玩家回應空間/);
  }

  const card = JSON.parse(read('data/characters/community/c4/kept-in-frame-lin-youzhen.json'));
  const content = card.content;
  assert.match(content.system_prompt, /【說話指紋】/);
  assert.match(content.system_prompt, /【主動意圖】/);
  assert.match(content.system_prompt, /示例只供抓取語感，不可直接複誦/);
  assert.match(content.system_prompt, /犯罪視為藝術/);
  assert.match(content.system_prompt, /不預設已殺過人/);
  assert.match(content.greeting, /委託樣片/);
  assert.match(content.greeting, /明天中午要交展覽的照片/);
  assert.match(content.greeting, /我大概真的會跟你辯到雨停/);
  assert.match(content.greeting, /收進抽屜/);
  assert.doesNotMatch(content.greeting, /你的心跳|你不由自主|你忍不住|你被吸引|你答應了/);
  assert.doesNotMatch(content.greeting, /他等著你的回答/);
  const scene = card.gameplay.initial_state.modules;
  assert.match(scene.scene.focus, /主動拿出兩張展覽候選委託樣片/);
  assert.match(scene.focus_person.visible_action, /兩張展覽候選委託樣片/);
  assert.match(scene.recent_events[0].summary, /主動展示兩張展覽候選樣片/);
  assert.equal(scene.photo_log.length, 2, 'public candidate photos must be recorded');
  assert.equal(scene.appointments.length, 1, 'submission deadline must be tracked');
  assert.match(scene.focus_person.known_schedule, /週六中午前/);
  assert.match(scene.public_bond.unanswered_question, /倒扣的照片/);
  assert.match(scene.evidence[0].summary, /內容尚未見到/);
  console.log('PASS: natural dialogue global layer, role voice, and opening continuity');
})().catch(error => { console.error(error); process.exitCode = 1; });
