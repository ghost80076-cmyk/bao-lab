/* Optional native status pack. Story-local data, not authored HTML or a second AI call. */
(() => {
  'use strict';
  if (window.BAONativeStatusPacks || !window.App || !window.BAOCharacterStatus || !window.GameState) return;
  const WORLD = 'autonomous-npc-world';
  const PACK = 'mature_relations_v1';
  const UNKNOWN = -1;
  const FIELDS = [
    { key: 'affinity', label: '好感', type: 'meter', context: 'relevant', default: UNKNOWN, min: UNKNOWN, max: 100, description: '成年 NPC 的關係好感，-1 表示未知；只有有明確互動依據時更新 0～100，不把好感視為同意。' },
    { key: 'trust', label: '信任', type: 'meter', context: 'relevant', default: UNKNOWN, min: UNKNOWN, max: 100, description: '成年 NPC 的信任程度，-1 表示未知；根據明確事件更新，不把信任視為同意。' },
    { key: 'sexual_desire', label: '性慾值', type: 'meter', context: 'relevant', default: UNKNOWN, min: UNKNOWN, max: 100, description: '只追蹤明確為成年人的 NPC；-1 表示未知，0 表示已確認沒有性慾。不能從衣著、羞恥、恐懼、拒絕或好感推定性慾；不代表同意。' },
    { key: 'openness', label: '開放度', type: 'meter', context: 'relevant', default: UNKNOWN, min: UNKNOWN, max: 100, description: '只依成年 NPC 明確表達的關係態度更新；-1 表示未知；不代表同意，也不因任何情緒或壓力推定。' },
    { key: 'boundaries', label: '親密界線', type: 'text', context: 'relevant', default: '未知', description: '僅記錄成年 NPC 自己明示的意願與界線；當前同意必須另行確認，不由數值推斷。' },
    { key: 'current_activity', label: '正在做什麼', type: 'text', context: 'relevant', default: '未知', description: '只記錄 NPC 在當前劇情已明示的行動；離場時不得把預計行為當成已發生。' },
    { key: 'known_about_player', label: '已知玩家資訊', type: 'tags', context: 'relevant', default: [], description: '只記錄該 NPC 確實透過對話、觀察或文件得知的玩家資訊；其他 NPC 的秘密不得共享。' },
    { key: 'lasting_changes', label: '持續狀態', type: 'tags', context: 'relevant', default: [], description: '僅追蹤已明確成立的持續變化；不得由單次行為推定懷孕、身體改變或心理狀態。' }
  ];
  const isWorld = () => App.activeCharacter?.id === WORLD;
  const visible = () => {
    const cfg = BAOCharacterStatus.configFor(App.activeCharacter);
    return cfg.fields.filter(field => !cfg.customization.hidden.includes(field.key));
  };
  const enabled = () => {
    const cfg = BAOCharacterStatus.configFor(App.activeCharacter);
    return Boolean(GameState.current?.nativeMaturePack) && FIELDS.every(item => cfg.fields.some(field => field.key === item.key && !cfg.customization.hidden.includes(field.key)));
  };
  const unknown = value => value === UNKNOWN || value === null || value === undefined || value === '' || /^(?:未知|未設定|—)$/.test(String(value));
  function applyPack() {
    if (!GameState.current || !isWorld()) return false;
    if (!window.confirm('這組狀態只供所有相關角色皆為成年人的故事使用。性慾、好感及開放度不代表同意；確定加入目前故事的原生狀態欄嗎？')) return false;
    const current = BAOCharacterStatus.getCustomization(App.activeCharacter);
    const existing = new Set(BAOCharacterStatus.configFor(App.activeCharacter).fields.map(field => field.key));
    const additions = FIELDS.filter(field => !existing.has(field.key)).map(field => ({ ...field, template_id: PACK + '_' + field.key, track: true }));
    if (additions.length > BAOCharacterStatus.MAX_CUSTOM_FIELDS - current.customFields.length) { window.alert('目前故事的自訂欄位已滿，請先在狀態欄管理移除不用的欄位。'); return false; }
    current.customFields.push(...additions);
    const keys = new Set(FIELDS.map(field => field.key));
    current.hidden = current.hidden.filter(key => !keys.has(key));
    current.order = [...new Set([...current.order, ...additions.map(field => field.key)])];
    BAOCharacterStatus.applyCustomization(current, App.activeCharacter);
    GameState.current.nativeMaturePack = true;
    App.saveStory?.(false);
    App.renderUIPanel?.('npc');
    window.BAOSceneHTML?.paintStatus?.();
    return true;
  }
  function showManagerButton() {
    if (!isWorld() || !GameState.current) return;
    const manager = document.querySelector('.status-manager-backdrop .status-template-list');
    if (!manager || manager.querySelector('[data-native-mature-pack]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.nativeMaturePack = 'true';
    button.textContent = enabled() ? '✓ 已加入：成熟關係（可在下方編輯）' : '＋ 成熟關係・性慾／開放度';
    button.disabled = enabled();
    button.addEventListener('click', () => {
      if (!applyPack()) return;
      document.querySelector('.status-manager-backdrop')?.remove(); // Old draft would overwrite the new fields on save.
    });
    manager.append(button);
  }
  const section = (title, items) => {
    const block = document.createElement('section'); block.className = 'bao-native-status-section';
    const head = document.createElement('h4'); head.textContent = title; block.append(head);
    if (!items.length) { const empty = document.createElement('p'); empty.textContent = '目前沒有已確認資料。'; block.append(empty); }
    else block.append(...items);
    return block;
  };
  const line = (label, value) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong'); strong.textContent = label + '：';
    p.append(strong, document.createTextNode(String(value ?? '未知')));
    return p;
  };
  const formatValue = value => unknown(value) ? '未知' : Array.isArray(value) ? (value.length ? value.join('、') : '尚無記錄') : typeof value === 'boolean' ? (value ? '是' : '否') : String(value);
  const npcCard = (npc, fields, statuses) => {
    const card = document.createElement('article'); card.className = 'bao-native-status-person';
    const title = document.createElement('button'); title.type = 'button'; title.className = 'bao-native-status-person-name';
    title.textContent = npc.name; title.title = '下一輪優先參考這位 NPC';
    title.addEventListener('click', () => { GameState.current.uiContextCharacter = npc.name; App.renderUIPanel?.('npc'); });
    card.append(title);
    if (npc.role && npc.role !== 'NPC') card.append(line('身分', npc.role));
    card.append(line('情緒', npc.mood || '未知'));
    card.append(line('位置', npc.location || '未知'));
    if (npc.presence === 'away' && npc.expected_action) card.append(line('預計行為（未確認）', npc.expected_action));
    const values = statuses[npc.name] || {};
    fields.forEach(field => card.append(line(field.label, formatValue(values[field.key]))));
    return card;
  };
  const getSections = () => {
    const s = GameState.current;
    if (!s || !isWorld()) return null;
    const statuses = s.characterStatuses || {};
    const fields = visible();
    const person = App.config?.persona || {};
    const player = document.createElement('article'); player.className = 'bao-native-status-person';
    player.append(line('姓名', person.name || '未設定'), line('身分', person.identity || '未設定'), line('時間', s.time || '未設定'), line('地點', s.location || '未設定'));
    const economy = s.modules?.economy || {};
    const money = economy.balance ?? economy.money ?? economy.gold;
    player.append(line('金錢', money == null ? '未記錄' : `${money}${economy.currency ? ' ' + economy.currency : ''}`));
    const npcs = (s.npcs || []).filter(n => n?.name && n.name !== App.activeCharacter?.name);
    const present = [], away = [], uncertain = [];
    npcs.forEach(npc => {
      if (npc.presence === 'present' || (npc.location && npc.location !== '未知' && s.location && npc.location === s.location)) present.push(npc);
      else if (npc.presence === 'away' || (npc.location && npc.location !== '未知' && s.location && s.location !== '未設定' && npc.location !== s.location)) away.push(npc);
      else uncertain.push(npc);
    });
    const events = (s.events || []).filter(item => item && !/^玩家與 .+ 完成一輪互動。$/.test(item) && item !== '故事剛剛開始。').slice(0, 3);
    const log = events.map(item => { const p = document.createElement('p'); p.textContent = item; return p; });
    return [section('👤 玩家資料', [player]), section('👥 當前場景 NPC', present.map(n => npcCard(n, fields, statuses))), section('🚪 離場 NPC', away.map(n => npcCard(n, fields, statuses))), ...(uncertain.length ? [section('❔ 位置待確認', uncertain.map(n => npcCard(n, fields, statuses)))] : []), section('⚠️ 最近三條狀態日誌', log)];
  };
  const board = () => {
    const sections = getSections();
    if (!sections) return null;
    const wrap = document.createElement('div'); wrap.className = 'bao-native-status-board';
    wrap.append(...sections); return wrap;
  };
  const oldPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    const result = oldPanel(panel);
    if (panel !== 'npc' || !isWorld() || !GameState.current) return result;
    const host = document.getElementById('ui-panel');
    if (!host) return result;
    host.querySelector('.bao-native-status-board')?.remove();
    const display = board();
    if (display) { host.dataset.nativeNpcBoard = 'true'; host.prepend(display); }
    const toolbar = host.querySelector('.character-status-toolbar');
    if (toolbar && !toolbar.querySelector('[data-native-mature-pack]')) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.nativeMaturePack = 'true';
      button.className = 'secondary'; button.textContent = enabled() ? '✓ 成熟關係已啟用' : '＋ 成熟關係狀態包';
      button.disabled = enabled(); button.addEventListener('click', applyPack); toolbar.append(button);
    }
    return result;
  };
  function paintSceneStatus() {
    const target = document.getElementById('bao-scene-native-status');
    if (!target || !isWorld() || !GameState.current || window.BAOSceneHTML?.prefs?.status !== 'native') return;
    const display = board();
    if (display) target.replaceChildren(display);
  }
  const originalApply = GameState.applyUpdate.bind(GameState);
  GameState.applyUpdate = function(...args) {
    const result = originalApply(...args);
    if (isWorld() && GameState.current) queueMicrotask(() => {
      if (document.querySelector('.ui-tab[data-panel="npc"]')?.classList.contains('active')) App.renderUIPanel('npc');
      paintSceneStatus();
    });
    return result;
  };
  function hookScene() {
    if (!window.BAOSceneHTML || window.BAOSceneHTML.__nativePacksHooked) return;
    const prior = BAOSceneHTML.paintStatus.bind(BAOSceneHTML);
    BAOSceneHTML.paintStatus = function(...args) { const result = prior(...args); paintSceneStatus(); return result; };
    BAOSceneHTML.__nativePacksHooked = true;
    paintSceneStatus();
  }
  hookScene();
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('.status-manager-backdrop') || node.querySelector?.('.status-manager-backdrop'))))) showManagerButton();
    if (!window.BAOSceneHTML?.__nativePacksHooked && document.getElementById('bao-scene-native-status')) hookScene();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const style = document.createElement('style');
  style.textContent = '.bao-native-status-board{display:grid;gap:12px;overflow-wrap:anywhere}.bao-native-status-section{border:1px solid #7775;border-radius:12px;padding:10px;background:#7771}.bao-native-status-section h4{margin:0 0 8px;font-size:14px}.bao-native-status-section p{margin:5px 0;white-space:pre-wrap}.bao-native-status-person{padding:10px;border:1px solid #7774;border-radius:10px;margin:6px 0}.bao-native-status-person-name{font:inherit;font-weight:700;text-align:left;cursor:pointer}.bao-native-status-person p{font-size:13px}#ui-panel[data-native-npc-board="true"] .character-status-grid{display:none}';
  document.head.append(style);
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { const result = originalShell(...args); hookScene(); paintSceneStatus(); return result; };
  window.BAONativeStatusPacks = { FIELDS, UNKNOWN, enabled, applyPack, getSections, board, paintSceneStatus, hookScene };
})();