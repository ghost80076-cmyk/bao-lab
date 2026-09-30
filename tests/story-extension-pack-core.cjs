const assert = require("node:assert/strict");
const core = require("../js/story-extension-pack-core.js");

{
  const pack = core.buildPack({
    world: {
      enabledBuiltIns: ["quests", "quests", "not-real"],
      disabled: ["quests", "work_inventory"],
      order: ["work_inventory", "quests", "custom_map"],
      customModules: [{
        id: "custom_map",
        label: "玩家地圖",
        context: "ui_only",
        tracking: "manual",
        kind: "object",
        triggers: ["地圖"],
        fields: [{ key: "zone", label: "區域", type: "text" }]
      }],
      api: { key: "must-not-export" },
      modules: { secret: "story-state-must-not-export" }
    },
    textReplace: {
      active: true,
      scope: { chat: true, status: true },
      rules: [{ id: "age", find: "20歲", replace: "XX歲", enabled: true }],
      messages: ["must-not-export"]
    },
    regex: {
      active: true,
      rules: [{ name: "稱呼", pattern: "先生", replacement: "老師", flags: "g", enabled: true }],
      authorRegex: { allowScripts: true }
    },
    story: { title: "private story" },
    apiKey: "secret"
  }, "2026-09-30T10:00:00Z");

  assert.equal(pack.schema, core.SCHEMA);
  assert.equal(pack.version, core.VERSION);
  assert.equal(pack.exportedAt, "2026-09-30T10:00:00.000Z");
  assert.deepEqual(pack.sections.world.enabledBuiltIns, ["quests"]);
  assert.deepEqual(pack.sections.world.disabled, ["quests"]);
  assert.deepEqual(pack.sections.world.order, ["quests", "custom_map"]);
  assert.equal(pack.sections.world.customModules[0].id, "custom_map");
  assert.equal(pack.sections.world.customModules[0].fields[0].key, "zone");
  assert.equal(pack.sections.textReplace.rules[0].find, "20歲");
  assert.equal(pack.sections.regex.rules[0].pattern, "先生");
  assert.equal(core.hasForbiddenKeys(pack), false);

  const serialized = JSON.stringify(pack);
  assert.doesNotMatch(serialized, /must-not-export|private story|apiKey|allowScripts/);
  assert.doesNotMatch(serialized, /work_inventory/);
}

{
  const unsafe = core.sanitizePack({
    schema: core.SCHEMA,
    version: 1,
    exportedAt: "2026-09-30T10:00:00Z",
    sections: {
      regex: {
        active: true,
        rules: [{
          name: "危險替換",
          pattern: "x",
          replacement: "<script>fetch('/secret')</script>",
          flags: "g",
          enabled: true
        }]
      }
    },
    messages: [{ role: "user", content: "private" }],
    api: { key: "secret" },
    authorRegex: { allowScripts: true }
  });

  assert.equal(unsafe.sections.regex.active, true);
  assert.equal(unsafe.sections.regex.rules[0].enabled, false);
  assert.equal(unsafe.sections.regex.rules[0].replacement, "");
  assert.match(unsafe.sections.regex.rules[0].reason, /不可攜/);
  assert.equal(core.hasForbiddenKeys(unsafe), false);
}

{
  const info = core.describePack({
    schema: core.SCHEMA,
    version: 1,
    sections: {
      world: {
        enabledBuiltIns: ["inventory"],
        customModules: [{ id: "custom_notes", label: "筆記", kind: "object" }]
      },
      textReplace: {
        active: false,
        rules: [{ find: "A", replace: "B" }]
      },
      regex: {
        active: false,
        rules: [
          { name: "ok", pattern: "A", replacement: "B" },
          { name: "bad", pattern: "(", replacement: "x" }
        ]
      }
    }
  });

  assert.deepEqual(info.sections.map(item => [item.id, item.count]), [
    ["world", 2],
    ["textReplace", 1],
    ["regex", 2]
  ]);
  assert.equal(info.counts.invalidRegex, 1);
  assert.match(info.sections.find(item => item.id === "regex").impact, /這台裝置所有故事/);
  assert.ok(info.excluded.includes("API Key"));
  assert.ok(info.excluded.includes("作品 Regex"));
}

{
  assert.throws(() => core.sanitizePack({ schema: "other", version: 1, sections: {} }), /不是夜灣/);
  assert.throws(() => core.sanitizePack({ schema: core.SCHEMA, version: 99, sections: { regex: {} } }), /版本/);
  assert.throws(() => core.sanitizePack({ schema: core.SCHEMA, version: 1, sections: {} }), /沒有可匯入/);
}

console.log("story extension pack core test passed");
