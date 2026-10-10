/* Author-side data builder; never executes a transaction or changes a live story. */
(function(root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./gameplay-ui-core.js') : root?.BAOGameplayUICore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOCharacterStudioActionsCore = api;
})(typeof window !== 'undefined' ? window : null, function(core) {
  'use strict';
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const key = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(value) && !['constructor','prototype','__proto__'].includes(value);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const fail = message => { throw new Error(message); };
  const clone = value => JSON.parse(JSON.stringify(value));
  function addInventoryAction(source, options) {
    if (!object(source) || !object(options) || !core) fail('無法建立互動操作。');
    const {kind, panelId = 'resource-actions', inventoryId = 'inventory', itemId, itemName, quantity, currencyId = 'economy', currencyField = 'crystals', price, balance = 20} = options;
    if (!['purchase','consume'].includes(kind) || ![panelId,inventoryId,itemId].every(key) || (kind === 'purchase' && (![currencyId,currencyField].every(key) || currencyId === inventoryId))) fail('請使用安全且不同的模組與物品 ID。');
    if (!integer(quantity,1,1000000) || (kind === 'purchase' && (!integer(price,1,1000000) || !integer(balance,0,1000000000)))) fail('數量與價格需為1～1000000整數，初始資源需為0～1000000000整數。');
    const label = String(options.label || '').trim(), name = String(itemName || '').trim();
    if (!label || label.length > 60 || !name || name.length > 120) fail('請填寫按鈕文字（最多60字）及物品名稱（最多120字）。');
    const event = String(options.event || '').trim();
    if (event.length > 160) fail('操作事件最多160字。');
    const card = clone(source);
    if (card.world_modules !== undefined && !Array.isArray(card.world_modules)) fail('原卡世界模組格式無效。');
    const definitions = card.world_modules ||= [];
    if (definitions.length > 12) fail('原卡世界模組超過12個上限。');
    if (card.initial_state !== undefined && !object(card.initial_state)) fail('原卡初始狀態格式無效。');
    const initial = card.initial_state ||= {};
    if (initial.modules !== undefined && !object(initial.modules)) fail('原卡初始模組格式無效。');
    const modules = initial.modules ||= {};
    function ensureModule(id, kind, label) {
      const matching = definitions.filter(def => def?.id === id);
      const def = matching[0];
      const actualKind = def?.kind || (['inventory','skills','quests','factions','equipment'].includes(id) ? 'collection' : 'object');
      if (matching.length > 1 || (def && (def.enabled === false || actualKind !== kind))) fail('原卡已有同名、停用或不同類型的模組，請更換模組 ID。');
      if (!def) {
        if (definitions.length >= 12) fail('世界模組已達12個上限。');
        definitions.push({id,kind,label,enabled:true});
      }
    }
    ensureModule(inventoryId,'collection','背包');
    if (!Object.hasOwn(modules,inventoryId)) modules[inventoryId] = [];
    const rows = modules[inventoryId], ids = new Set();
    if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => {
      if (!object(row) || !key(row.id) || ids.has(row.id) || !integer(row.quantity,0,1000000000)) return true;
      ids.add(row.id); return false;
    })) fail('既有背包需使用唯一物品 id 與有效整數 quantity；請先修正原卡資料。');
    const effect = {items:[{path:'modules.'+inventoryId,id:itemId,...(kind === 'purchase' ? {name} : {}),delta:kind === 'purchase' ? quantity : -quantity}], ...(event ? {event} : {})};
    if (kind === 'purchase') {
      ensureModule(currencyId,'object','資源');
      if (!Object.hasOwn(modules,currencyId)) modules[currencyId] = {};
      if (!object(modules[currencyId])) fail('既有資源模組需為物件。');
      if (!Object.hasOwn(modules[currencyId],currencyField)) modules[currencyId][currencyField] = balance;
      if (!integer(modules[currencyId][currencyField],0,1000000000)) fail('既有資源欄位需為有效非負整數。');
      effect.changes = [{path:`modules.${currencyId}.${currencyField}`,delta:-price}];
    }
    if (!core.normalizeActionEffect(effect)) fail('互動操作設定無效。');
    if (card.gameplay_ui !== undefined && card.gameplay_ui !== null && !object(card.gameplay_ui)) fail('既有互動 UI 格式無效。');
    const ui = card.gameplay_ui ||= {version:1,panels:[]};
    if (!Array.isArray(ui.panels) || ui.panels.length > 8) fail('既有互動面板格式無效。');
    const matches = ui.panels.filter(panel => panel?.id === panelId);
    if (matches.length > 1) fail('既有面板 ID 重複，請先修正。');
    let panel = matches[0];
    if (!panel) {
      if (ui.panels.length >= 8) fail('互動面板已達8個上限，請使用既有面板 ID。');
      panel = {id:panelId,label:'資源與背包',sections:[{type:'list',title:'背包',path:'modules.'+inventoryId}]};
      if (kind === 'purchase') panel.sections.unshift({type:'stats',title:'資源',items:[{label:'可用資源',path:`modules.${currencyId}.${currencyField}`}]});
      ui.panels.push(panel);
    }
    if (!Array.isArray(panel.sections) || panel.sections.length > 10) fail('既有面板內容格式無效。');
    let section = panel.sections.find(section => section?.type === 'actions' && section.title === '資源操作');
    if (!section) {
      if (panel.sections.length >= 10) fail('此面板已達10區塊上限，請使用其他面板。');
      section = {type:'actions',title:'資源操作',items:[]}; panel.sections.push(section);
    }
    if (!Array.isArray(section.items) || section.items.length >= 24) fail('此操作區塊已達24個按鈕上限或格式無效。');
    section.items.push({label,effect});
    card.supported_display = {...card.supported_display,text:true,ui:true};
    card.play_info_surface = 'game-ui';
    return card;
  }
  function resolveAction(card, location) {
    if (!object(location) || !['panel','section','item'].every(k => integer(location[k],0,100))) fail('操作位置無效，請重新選擇。');
    const panel = card.gameplay_ui?.panels?.[location.panel];
    const outer = panel?.sections?.[location.section];
    let sections = panel?.sections, section = outer, index = location.section, tab;
    if (location.tab !== undefined) {
      if (!integer(location.tab,0,7) || !integer(location.nestedSection,0,9) || outer?.type !== 'tabs') fail('分頁操作位置無效。');
      tab = outer.tabs?.[location.tab]; sections = tab?.sections; index = location.nestedSection; section = sections?.[index];
    }
    const action = section?.items?.[location.item];
    if (!Array.isArray(sections) || section?.type !== 'actions' || !object(action) || !action.effect) fail('找不到原生操作，請重新選擇。');
    return {panel,outer,sections,section,index,tab,action};
  }
  function inventoryActionOptions(card, location) {
    const {panel,action} = resolveAction(card,location), raw = action.effect;
    const effect = core.normalizeActionEffect(raw);
    if (!effect || Object.keys(raw).some(k => !['changes','items','event'].includes(k)) || effect.items?.length !== 1 || effect.changes.length > 1) return null;
    const item = effect.items[0], counter = effect.changes[0];
    if (Object.keys(raw.items[0]).some(k=>!['path','id','name','delta'].includes(k)) || (counter && Object.keys(raw.changes[0]).some(k=>!['path','delta'].includes(k)))) return null;
    const purchase = item.delta > 0 && counter?.delta < 0 && counter.path.split('.').length === 3;
    const consume = item.delta < 0 && !counter;
    if (!purchase && !consume) return null;
    const inventoryId = item.path.split('.')[1];
    const row = card.initial_state?.modules?.[inventoryId]?.find?.(row=>row?.id===item.id);
    const parts = counter?.path.split('.') || [];
    return {kind:purchase?'purchase':'consume',label:action.label,itemId:item.id,itemName:item.name || row?.name || item.id,
      quantity:Math.abs(item.delta),price:counter?Math.abs(counter.delta):15,balance:purchase?core.getPath({modules:card.initial_state?.modules},counter.path):20,
      inventoryId,currencyId:parts[1] || 'economy',currencyField:parts[2] || 'crystals',panelId:panel.id,event:effect.event};
  }
  function updateInventoryAction(source, location, values) {
    const original = inventoryActionOptions(source,location);
    if (!original) fail('此按鈕包含多重或特殊操作，請透過 Creator MCP 編輯。');
    const options = {...original};
    for (const key of ['label','itemName','quantity','price','event']) if (Object.hasOwn(values,key)) options[key] = values[key];
    const prepared = addInventoryAction({...source,gameplay_ui:null},options);
    const action = prepared.gameplay_ui.panels[0].sections.find(section=>section.type==='actions').items[0];
    prepared.gameplay_ui = clone(source.gameplay_ui);
    const target = resolveAction(prepared,location);
    target.section.items[location.item] = {...target.action,label:action.label,effect:action.effect};
    return prepared;
  }
  function removeInventoryAction(source, location) {
    const card = clone(source), target = resolveAction(card,location);
    target.section.items.splice(location.item,1);
    if (!target.section.items.length) target.sections.splice(target.index,1);
    if (target.tab && !target.sections.length) target.outer.tabs.splice(location.tab,1);
    if (target.tab && !target.outer.tabs.length) target.panel.sections.splice(location.section,1);
    if (!target.panel.sections.length) card.gameplay_ui.panels.splice(location.panel,1);
    if (!card.gameplay_ui.panels.length) card.gameplay_ui = null;
    return card;
  }
  return {addInventoryAction, inventoryActionOptions, updateInventoryAction, removeInventoryAction};
});
