"""One-time, fail-closed migration: current scene NPCs are not a permanent character card.

Run only against the reviewed BAO/LAB code; every text edit asserts its expected source.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def edit(path, old, new):
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    assert text.count(old) == 1, f"Unexpected source for {path}: {old[:110]!r} ({text.count(old)} matches)"
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


path = ROOT / "data/characters/general/desire-district.json"
card = json.loads(path.read_text(encoding="utf-8"))
assert card["meta"]["id"] == "desire-district"
prompt = card["content"]["system_prompt"]
old = "未成年人物可僅出現在非性化的普通生活或犯罪調查背景，絕不參與性化或性交易。平行時空、戰亂、表演者或『外貌成年』不能取代明確成年身分。"
assert old in prompt
prompt = prompt.replace(old, "本卡的成人服務與親密互動角色皆為明確成年的原創人物；平行世界、動漫畫風或演員設定不改變成年設定。")
old = "未成年不得被納入成人服務或性化支線。"
assert old in prompt
prompt = prompt.replace(old, "服務與親密互動角色皆為已確認成年且能自主作決定的人物。")
old = "貓姐兒只是開場的『當前在場NPC』範例，不是永遠固定主角或全員共用模板。"
assert old in prompt
prompt = prompt.replace(old, "貓姐兒是開場入口的實際『當前在場NPC』，不是世界系統、永久主角或全員共用模板。開場她與玩家同處登記處，應以她的狀態回應；玩家轉場後，在場NPC依當前場景與人物位置重新判定。")
card["content"]["system_prompt"] = prompt
old = "不得將『學生妹』『蘿莉』『未成年』『看似小孩』等未成年或幼態設定用於性化角色。"
lore = card["content"]["lore"]
assert old in lore
card["content"]["lore"] = lore.replace(old, "所有可提供成人服務的人物皆為明確成年的原創角色；以成年人的體態、五官、衣著與氣質表現角色差異。")
for item in card["gameplay"]["dynamic_prompts"]:
    if item["id"] == "district-risk":
        old = "強迫或未成年相關事件只作非色情化的危險、求助及法律後果"
        assert old in item["text"]
        item["text"] = item["text"].replace(old, "脅迫與販運事件只作非色情化的危險、求助及法律後果")
initial = card["gameplay"]["initial_state"]
assert initial["npcs"][0]["name"] == "貓姐兒"
assert list(initial["character_statuses"]) == ["貓姐兒"]
initial["npcs"][0]["presence"] = "present"
initial["npcs"][0]["notes"] = "開場時在登記處與玩家互動的當前NPC；轉場後保留人物紀錄，不能仍當成在場NPC。"
assert "未成年" not in json.dumps(card["content"], ensure_ascii=False)
path.write_text(json.dumps(card, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Retain separately owned NPC histories. The world engine's title is not a person.
edit("js/character-status.js",
     '  const trackedNames = character => [\n    character?.name || window.App?.activeCharacter?.name,\n    ...(GameState.current?.npcs || []).map(n => n?.name)\n  ].filter(Boolean);',
     '  const trackedNames = character => [\n    ...(character?.id === "desire-district" ? [] : [character?.name || window.App?.activeCharacter?.name]),\n    ...(GameState.current?.npcs || []).map(n => n?.name)\n  ].filter(Boolean);')
edit("js/character-status.js",
     '    const all = Object.keys(state.characterStatuses || {});\n    const viewed = String(state.uiContextCharacter || "");\n    const scored = all.map(name => {\n      let score = hay.includes(name.toLowerCase()) ? 6 : 0;\n      if (name === viewed) score += 4;\n      if (name === window.App?.activeCharacter?.name) score += 1;\n      return { name, score };\n    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)\n      .slice(0, Math.max(1, Math.min(4, Number(options.maxCharacters || 3))))\n      .map(x => x.name);\n    if (!scored.length && all.length === 1) return all;\n    return scored;',
     '    const district = window.App?.activeCharacter?.id === "desire-district";\n    const all = Object.keys(state.characterStatuses || {}).filter(name => !district || name !== window.App?.activeCharacter?.name);\n    const inScene = new Set((state.npcs || []).filter(npc => npc?.name && npc.presence !== "away" &&\n      (npc.location === state.location || (npc.presence === "present" && (!npc.location || npc.location === "未知")))).map(npc => npc.name));\n    const viewed = String(state.uiContextCharacter || "");\n    const scored = all.map(name => {\n      const mentioned = hay.includes(name.toLowerCase());\n      if (district && !mentioned && !inScene.has(name)) return { name, score: 0 };\n      let score = mentioned ? 6 : 0;\n      if (name === viewed) score += 4;\n      if (name === window.App?.activeCharacter?.name) score += 1;\n      if (district && inScene.has(name)) score += 2;\n      return { name, score };\n    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)\n      .slice(0, Math.max(1, Math.min(4, Number(options.maxCharacters || 3))))\n      .map(x => x.name);\n    if (!scored.length && !district && all.length === 1) return all;\n    return scored;')

# The NPC list is a patch, not a roster replacement; preserve each person's record.
edit("js/state.js",
     '    ["name", "role", "mood", "location", "relationship", "personality", "notes"].forEach(k => {',
     '    ["name", "role", "mood", "location", "relationship", "personality", "notes"].forEach(k => {') if False else None
edit("js/state.js",
     '    if (found) Object.assign(found, clean);',
     '    if (["present", "away", "unknown"].includes(npc.presence)) clean.presence = npc.presence;\n    if (found) Object.assign(found, clean);')
edit("js/helper-data.js",
     '      if (typeof n.relationship === "number" && Number.isFinite(n.relationship)) clean.relationship = n.relationship;\n      return clean;',
     '      if (typeof n.relationship === "number" && Number.isFinite(n.relationship)) clean.relationship = n.relationship;\n      if (["present", "away", "unknown"].includes(n.presence)) clean.presence = n.presence;\n      return clean;')
edit("js/world-state.js",
     '        relationship: n.relationship ?? "未設定"\n      })),',
     '        relationship: n.relationship ?? "未設定",\n        presence: n.presence || "unknown"\n      })),')
edit("js/world-state.js",
     '      "不得自行新增未發生的劇情。沒有變化的欄位請保留原值。",',
     '      "不得自行新增未發生的劇情。沒有變化的欄位請保留原值。",\n      "npcs 是人物狀態的 PATCH，不是全島完整名單；只依場景可證實的人物進出更新 presence：present（在場）、away（離場）、unknown（不確定）。轉場後不能把原登記員自動視為在場，既有人物資料仍要保留。",')
edit("js/world-state.js",
     '      "格式：{\\"time\\":\\"\\",\\"location\\":\\"\\",\\"events\\":[\\"\\"],\\"npcs\\":[{\\"name\\":\\"\\",\\"role\\":\\"\\",\\"mood\\":\\"\\",\\"location\\":\\"\\",\\"relationship\\":\\"\\"}]}",',
     '      "格式：{\\"time\\":\\"\\",\\"location\\":\\"\\",\\"events\\":[\\"\\"],\\"npcs\\":[{\\"name\\":\\"\\",\\"role\\":\\"\\",\\"mood\\":\\"\\",\\"location\\":\\"\\",\\"relationship\\":\\"\\",\\"presence\\":\\"present\\"}]}",')

# Only Desire District is a world title with a separate current NPC; other cards keep their UI.
edit("js/character-status-ui.js",
     '    const names = [App.activeCharacter?.name, ...(GameState.current?.npcs || []).map(n => n?.name)].filter(Boolean);',
     '    const isDistrict = App.activeCharacter?.id === "desire-district";\n    const sceneNPCs = (GameState.current?.npcs || []).filter(npc => npc?.name && npc.presence !== "away" &&\n      (npc.location === GameState.current?.location || (npc.presence === "present" && (!npc.location || npc.location === "未知"))));\n    const names = isDistrict ? sceneNPCs.map(npc => npc.name) : [App.activeCharacter?.name, ...(GameState.current?.npcs || []).map(n => n?.name)].filter(Boolean);')
edit("js/character-status-ui.js",
     '    ui.innerHTML = `<div class="character-status-toolbar"><p>角色卡預設欄位與玩家自訂欄位共同組成這份故事的實際狀態欄。</p>${cfg.allow_player_customize ? \'<button type="button" class="secondary" data-character-status-settings>⚙ 狀態欄管理</button>\' : ""}</div><div class="character-status-grid">${cards || \'<div class="character-status-empty">目前沒有可追蹤人物。</div>\'}</div>`;',
     '    ui.innerHTML = `<div class="character-status-toolbar"><p>${isDistrict ? "👥 當前場景 NPC（離場角色資料仍保存在故事中）" : "角色卡預設欄位與玩家自訂欄位共同組成這份故事的實際狀態欄。"}</p>${cfg.allow_player_customize ? \'<button type="button" class="secondary" data-character-status-settings>⚙ 狀態欄管理</button>\' : ""}</div><div class="character-status-grid">${cards || (isDistrict ? \'<div class="character-status-empty">當前場景沒有已確認的在場 NPC。</div>\' : \'<div class="character-status-empty">目前沒有可追蹤人物。</div>\')}</div>`;')
edit("js/scene-html-modes.js",
     '    const preferred = state.uiContextCharacter || App.activeCharacter?.name;\n    const name = names.includes(preferred) ? preferred : names[0];',
     '    const district = App.activeCharacter?.id === "desire-district";\n    const present = (state.npcs || []).filter(npc => npc?.name && npc.presence !== "away" &&\n      (npc.location === state.location || (npc.presence === "present" && (!npc.location || npc.location === "未知")))).map(npc => npc.name);\n    const preferred = state.uiContextCharacter || App.activeCharacter?.name;\n    const name = district ? (present.includes(preferred) ? preferred : present.find(item => names.includes(item)) || null)\n      : names.includes(preferred) ? preferred : names[0];')
edit("js/scene-html-modes.js",
     '    const heading = document.createElement(\'strong\'); heading.textContent = shared.name || \'世界狀態\';\n    const rows = shared.fields.map(field => {',
     '    const heading = document.createElement(\'strong\'); heading.textContent = shared.name || (App.activeCharacter?.id === "desire-district" ? \'當前場景沒有已確認 NPC\' : \'世界狀態\');\n    const rows = shared.name ? shared.fields.map(field => {')

# Tests: new story, scene switch, return, separate status, presence parsing.
test = ROOT / "tests/desire-district-current-npc.cjs"
assert not test.exists(), "Test path already exists: inspect before replacing"
test.write_text('''const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.App = { config: {}, activeCharacter: null };
global.API = { send: async () => ({ text: '{}' }) };
const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file });
run('js/state.js');
run('js/world-state.js');
run('js/character-status.js');
run('js/helper-data.js');
run('js/character.js');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/characters/general/desire-district.json'), 'utf8'));
const card = CharacterEngine.normalize(raw);
App.activeCharacter = card;
GameState.create(card, App.config);
assert.equal(GameState.current.npcs[0].name, '貓姐兒');
assert.equal(GameState.current.npcs[0].presence, 'present');
assert.deepEqual(Object.keys(GameState.current.characterStatuses), ['貓姐兒']);
assert.deepEqual(BAOCharacterStatus.namesForTurn('我看看登記處的環境'), ['貓姐兒']);
const data = BAOHelperData.stateUpdate({ location: '霓港島・中等區・夜鶯會所', npcs: [
  { name: '貓姐兒', presence: 'away' },
  { name: '阿薇', role: '會所經理', location: '霓港島・中等區・夜鶯會所', presence: 'present' }
]}, []);
assert.equal(data.npcs[0].presence, 'away');
GameState.applyUpdate(data);
assert.equal(GameState.current.npcs.find(n => n.name === '貓姐兒').presence, 'away');
assert.equal(GameState.current.characterStatuses['貓姐兒'].identity.includes('32歲'), true);
assert.deepEqual(BAOCharacterStatus.namesForTurn('我看看這間店'), ['阿薇']);
assert.deepEqual(BAOCharacterStatus.namesForTurn('我想打電話找貓姐兒')[0], '貓姐兒');
GameState.applyUpdate({ location: '霓港島・慾望街區入口・登記處', npcs: [{ name: '貓姐兒', presence: 'present' }, { name: '阿薇', presence: 'away' }] });
assert.deepEqual(BAOCharacterStatus.namesForTurn('我回到入口'), ['貓姐兒']);
assert.ok(!JSON.stringify(raw.content).includes('未成年'));
console.log('Desire District current NPC scene switch and adult-only prompt checks passed.');
''', encoding="utf-8")
print("Patched Desire District card, state, tracker, present-NPC display, and regression test")
