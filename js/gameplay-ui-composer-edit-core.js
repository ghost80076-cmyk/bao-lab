/* Pure structural edits on RAW Gameplay UI drafts. Never normalize over author data. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOGameplayUIComposerEditCore = api;
})(typeof self !== 'undefined' ? self : null, function() {
  'use strict';
  const TYPES = Object.freeze(['meters','stats','list','actions']);
  const fail = message => { throw new Error(message); };
  const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  function freshId(panels, prefix = 'panel_') {
    const ids = new Set(panels.map(p => p?.id));
    let n = 1; while (ids.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  }
  function at(ui, path) {
    if (!Array.isArray(path) || ![2,4,6].includes(path.length) || path[0] !== 'panels') fail('請先選擇面板或區塊。');
    for (let i = 1; i < path.length; i += 2) if (!Number.isInteger(path[i]) || path[i] < 0) fail('選取位置無效。');
    if (path.length >= 4 && path[2] !== 'sections' || path.length === 6 && path[4] !== 'items') fail('選取位置無效。');
    let value = ui;
    for (const key of path) value = value?.[key];
    if (!object(value)) fail('這個項目已不存在，請重新選擇。');
    return value;
  }
  const item = type => type === 'meters' ? {label:'生命',value_path:'modules.player.hp',min:0,max:100}
    : type === 'stats' ? {label:'時間',path:'time'} : {label:'查看四周',draft:'我查看四周。',hint:''};
  const section = type => {
    if (!TYPES.includes(type)) fail('這個組件目前只能保留與排序，欄位編輯將在後續版本提供。');
    return type === 'list' ? {type,title:'清單',path:'modules.inventory',limit:8,empty:'目前沒有資料。'}
      : {type,title:{meters:'狀態條',stats:'數值資訊',actions:'行動按鈕'}[type],items:[item(type)]};
  };
  function apply(source, command, core) {
    if (!core) fail('互動 UI 核心尚未就緒。');
    if (command.type === 'enable') return {ui: source ? {...clone(source),enabled:true} : {version:1,enabled:true,panels:[]}, selection:null};
    if (!object(source) || !Array.isArray(source.panels)) fail('原有面板格式不完整，請先備份並修正來源資料。');
    const ui = clone(source), panels = ui.panels;
    const path = command.path || [];
    if (command.type === 'add-panel') {
      if (panels.length >= core.MAX_PANELS) fail('面板已達上限。');
      panels.push({id:freshId(panels),label:'新面板',sections:[]});
      return {ui,selection:['panels',panels.length-1]};
    }
    const selected = at(ui,path);
    if (command.type === 'add-section') {
      if (path.length !== 2) fail('請先選擇面板。');
      if (!Array.isArray(selected.sections)) fail('原有區塊格式不完整，請先修正。');
      if (selected.sections.length >= core.MAX_SECTIONS) fail('區塊已達上限。');
      selected.sections.push(section(command.sectionType));
      return {ui,selection:path.concat('sections',selected.sections.length-1)};
    }
    if (command.type === 'add-item') {
      if (path.length !== 4 || !['meters','stats','actions'].includes(selected.type) || !Array.isArray(selected.items)) fail('這個區塊無法加入項目。');
      if (selected.items.length >= core.MAX_ITEMS) fail('項目已達上限。');
      selected.items.push(item(selected.type));
      return {ui,selection:path};
    }
    if (command.type === 'set') {
      const allowed = path.length === 2 ? ['id','label'] : path.length === 4 ? ['title','path','limit','empty']
        : ['label','path','value_path','max_path','min','max','suffix','draft','hint'];
      if (!allowed.includes(command.key) || command.value !== undefined && !['string','number'].includes(typeof command.value)) fail('這個欄位無法修改。');
      if (typeof command.value === 'number' && !Number.isFinite(command.value)) fail('請輸入有效數值。');
      if (path.length === 2 && command.key === 'id') {
        if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(command.value) || ['__proto__','constructor','prototype'].includes(command.value)) fail('ID 需以英文字母開頭，只能使用英數、底線與連字號。');
        if (panels.some((p,i)=>i!==path[1]&&p.id===command.value)) fail('面板 ID 已存在，請使用另一個 ID。');
        if (object(ui.layout)) for (const key of ['left_panel','right_panel','primary_panel','left','right','panel']) {
          if (ui.layout[key] === selected.id) ui.layout[key] = command.value;
        }
      }
      if (command.value === undefined) delete selected[command.key]; else selected[command.key] = command.value;
      return {ui,selection:path.slice(0,4)};
    }
    let parent = ui; for (const key of path.slice(0,-1)) parent = parent[key];
    const index = path.at(-1);
    if (command.type === 'remove') {
      parent.splice(index,1);
      if (path.length === 2 && object(ui.layout)) for (const key of ['left_panel','right_panel','primary_panel','left','right','panel']) {
        if (ui.layout[key] === selected.id) delete ui.layout[key];
      }
      const selection = path.length === 2 ? (parent.length ? ['panels',Math.min(index,parent.length-1)] : null)
        : path.length === 4 ? path.slice(0,2) : path.slice(0,4);
      return {ui,selection};
    }
    if (command.type === 'copy') {
      const limit = path.length===2 ? core.MAX_PANELS : path.length===4 ? core.MAX_SECTIONS : core.MAX_ITEMS;
      if (parent.length >= limit) fail('已達上限，無法複製。');
      const copied = clone(selected);
      if (path.length === 2) {copied.id=freshId(panels);copied.label=String(copied.label||'面板')+' 副本';}
      else if (path.length===4 && copied.id) copied.id = freshId(parent, 'section_');
      parent.splice(index+1,0,copied);
      return {ui,selection:path.slice(0,-1).concat(index+1)};
    }
    if (command.type === 'move') {
      const to = command.to;
      if (!Number.isInteger(to) || to<0 || to>=parent.length) fail('無法移到這個位置。');
      parent.splice(to,0,parent.splice(index,1)[0]);
      return {ui,selection:path.slice(0,-1).concat(to)};
    }
    fail('不支援這個操作。');
  }
  return Object.freeze({TYPES,apply});
});
