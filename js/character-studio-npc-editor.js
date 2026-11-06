/* Optional author-side editor for initial_state.npcs; no separate store or model requests. */
(() => {
  'use strict';
  const studio = window.BAOCharacterStudio;
  const core = window.BAOStudioNPCEditorCore;
  const form = document.getElementById('studio-form');
  const anchor = document.getElementById('studio-npc-personality');
  if (!studio || !core || !form || !anchor || window.BAOStudioNPCEditor) return;

  const panel = document.createElement('details');
  panel.id = 'studio-npc-editor';
  panel.className = 'studio-npc-editor';
  panel.innerHTML = [
    '<summary>初始 NPC 編輯器 · 人物／目標／關係（選填）</summary>',
    '<p class="note">直接編輯角色卡的初始 NPC 名冊，不建立另一份人物資料。世界書、人物狀態與頭像仍是各自獨立的設定。</p>',
    '<div class="studio-npc-list" data-npc-list></div>',
    '<button type="button" class="secondary" data-npc-add>＋ 新增初始 NPC</button>',
    '<section data-npc-fields hidden aria-label="編輯初始 NPC">',
    '<div class="studio-npc-grid">',
    '<label>人物姓名 *<input data-npc-field="name" maxlength="100" placeholder="例如：林曼"></label>',
    '<label>別名（逗號分隔）<input data-npc-field="aliases" placeholder="例如：老大、Queen"></label>',
    '<label>身份／職業<input data-npc-field="role" maxlength="160"></label>',
    '<label>初始所在地<input data-npc-field="location" maxlength="160"></label>',
    '<label>初始在場狀態<select data-npc-field="presence"><option value="unknown">未知</option><option value="present">在場</option><option value="away">離場</option></select></label>',
    '<label>當前情緒<input data-npc-field="mood" maxlength="160"></label>',
    '</div>',
    '<label>固定外貌<textarea data-npc-field="appearance" rows="2" maxlength="800"></textarea></label>',
    '<label>人物性格與習慣<textarea data-npc-field="personality" rows="3" maxlength="1200"></textarea></label>',
    '<label>初始穿著<textarea data-npc-field="outfit" rows="2" maxlength="500"></textarea></label>',
    '<label>關係（請明確指出誰對誰，不預設雙向）<textarea data-npc-field="relationship" rows="2" maxlength="800"></textarea></label>',
    '<label>目標（加入 NPC 補充設定，模型可參考）<textarea data-npc-field="goal" rows="2" maxlength="800"></textarea></label>',
    '<label>其他 NPC 補充<textarea data-npc-field="notes" rows="2" maxlength="1500"></textarea></label>',
    '<label>作者備註／尚未公開的秘密（選填）<textarea data-npc-field="secret" rows="2" maxlength="1200"></textarea></label>',
    '<p class="note">作者備註儲存在原本的創作者備註欄，預設不送 AI；但會出現在匯出的 JSON 中，也可能依既有 Prompt 選項被提供給模型。它不是真正的保密機制，請勿填入不能公開的資料。</p>',
    '<div class="studio-npc-actions"><button type="button" class="primary" data-npc-save>儲存這位 NPC</button><button type="button" class="secondary" data-npc-cancel>取消編輯</button></div>',
    '</section>',
    '<p data-npc-status role="status" aria-live="polite" class="note"></p>'
  ].join('');
  anchor.before(panel);
  const fields = panel.querySelector('[data-npc-fields]');
  const listNode = panel.querySelector('[data-npc-list]');
  const status = panel.querySelector('[data-npc-status]');
  const notesField = form.elements.namedItem('creator_notes');
  const field = name => panel.querySelector('[data-npc-field="' + name + '"]');
  const names = ['name', 'aliases', 'role', 'location', 'presence', 'mood', 'appearance', 'personality', 'outfit', 'relationship', 'goal', 'notes', 'secret'];
  let originalName = '', pending = false;
  const message = value => { status.textContent = value; };
  function readFields() {
    return Object.fromEntries(names.map(name => [name, field(name).value]));
  }
  function writeFields(values = {}) {
    names.forEach(name => { field(name).value = values[name] || (name === 'presence' ? 'unknown' : ''); });
    field('name').readOnly = Boolean(originalName);
  }
  function cancel() {
    originalName = '';
    pending = false;
    fields.hidden = true;
    writeFields({});
    message('尚未編輯的內容不會寫入角色卡。');
  }
  function edit(npc = null) {
    try {
      originalName = npc?.name || '';
      writeFields(npc ? core.inspect(npc, notesField.value) : {});
      fields.hidden = false;
      pending = false;
      panel.open = true;
      message(originalName ? '正在編輯「' + originalName + '」。修改後請按儲存這位 NPC。' : '新增角色尚未寫入作品。');
      field(originalName ? 'role' : 'name').focus();
    } catch (error) {
      message('無法編輯：' + error.message);
      cancel();
      message('原 NPC 補充設定含異常標記，尚未修改任何資料。');
    }
  }
  function render() {
    listNode.replaceChildren();
    const list = studio.getInitialNPCs();
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = '尚未設定初始 NPC；不影響故事進行中新增角色。';
      listNode.append(empty);
      return;
    }
    list.forEach(npc => {
      if (!npc?.name) return;
      const item = document.createElement('div');
      item.className = 'studio-npc-item';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = String(npc.name);
      const summary = document.createElement('small');
      summary.textContent = [npc.role, npc.location, npc.relationship].filter(Boolean).join(' · ') || '尚未補充身分／關係';
      info.append(title, summary);
      const actions = document.createElement('div');
      actions.className = 'studio-npc-item-actions';
      const modify = document.createElement('button');
      modify.type = 'button'; modify.className = 'secondary'; modify.textContent = '編輯';
      modify.setAttribute('aria-label', '編輯 ' + npc.name);
      modify.addEventListener('click', () => edit(npc));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'secondary'; remove.textContent = '移除';
      remove.setAttribute('aria-label', '移除 ' + npc.name);
      remove.addEventListener('click', () => {
        if (!window.confirm('移除「' + npc.name + '」的初始名冊資料及其作者備註？世界書、角色頭像、狀態欄參照不會自動刪除，請另行核對。')) return;
        try {
          const next = core.remove(studio.getInitialNPCs(), npc.name);
          const nextNotes = core.withSecret(notesField.value, npc.name, '');
          studio.setInitialNPCs(next);
          if (nextNotes !== notesField.value) {
            notesField.value = nextNotes;
            notesField.dispatchEvent(new Event('input', { bubbles: true }));
          }
          cancel(); render(); message('已從角色卡草稿移除初始 NPC；其他參照保持不變。');
        } catch (error) { message('無法移除：' + error.message); }
      });
      actions.append(modify, remove);
      item.append(info, actions); listNode.append(item);
    });
  }
  panel.querySelector('[data-npc-add]').addEventListener('click', () => edit(null));
  panel.querySelector('[data-npc-cancel]').addEventListener('click', cancel);
  panel.querySelector('[data-npc-save]').addEventListener('click', () => {
    try {
      const values = readFields();
      const next = core.upsert(studio.getInitialNPCs(), values, originalName);
      const nextNotes = core.withSecret(notesField.value, values.name, values.secret);
      studio.setInitialNPCs(next);
      if (nextNotes !== notesField.value) {
        notesField.value = nextNotes;
        notesField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      cancel(); render();
      message('NPC 已寫入目前角色卡；請再儲存草稿或匯出，不會自動發布。');
    } catch (error) { message('請修正：' + error.message); }
  });
  fields.addEventListener('input', () => { pending = true; });
  fields.addEventListener('change', () => { pending = true; });
  window.addEventListener('bao:character-studio-card-shown', () => {
    cancel(); render();
  });
  window.BAOStudioNPCEditor = Object.freeze({
    assertCommitted() {
      if (pending && !fields.hidden) throw new Error('初始 NPC 尚未按「儲存這位 NPC」，請先儲存或取消編輯。');
    },
    render
  });
  render();
})();
