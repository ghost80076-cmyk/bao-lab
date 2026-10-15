/* Labels and grouping names only: never replace action nodes, click handlers or stored records. */
(() => {
  'use strict';
  if (window.BAOChatControlsClarity) return;
  const aside = () => document.querySelector('#chat-view .chat-layout > aside');
  const names = {
    world: '◇ 人物與世界',
    story: '▤ 故事與記憶',
    settings: '⚙ AI 與指令',
    scene: '◈ 畫面與操作',
    other: '其他與支援'
  };
  const rename = (node, label, help) => {
    if (!node) return;
    if (node.textContent.trim() !== label) node.textContent = label;
    if (help && node.title !== help) node.title = help;
  };
  const sync = () => {
    const sidebar = aside();
    if (!sidebar) return;
    for (const [name, label] of Object.entries(names)) {
      rename(sidebar.querySelector(`[data-chat-tool-group="${name}"] > summary`), label);
    }
    rename(sidebar.querySelector('#save-slot-button'), '另存手動備份', '建立可自行命名、獨立讀取的手動存檔');
    rename(sidebar.querySelector('#list-slots-button'), '手動備份清單', '檢視、讀取、匯出或刪除手動存檔；與自動存檔不同');
    rename(sidebar.querySelector('#import-save-button'), '匯入備份檔', '從本機匯入故事備份，不會自動連接模型');
    rename(sidebar.querySelector('[data-bao-open="story-tools"]'), '故事庫與完整備份', '查看所有故事和章節，也可整理前情及匯出完整故事');
    rename(sidebar.querySelector('#bao-chat-api-aside'), '模型連線', '選擇模型或輸入連線金鑰（API Key），不會清空故事');
    const drawer = document.getElementById('bao-chat-tool-drawer');
    if (drawer) {
      for (const [name, label] of Object.entries(names)) {
        const selector = `[data-bao-clarity-group="${name}"]`;
        const existing = drawer.querySelector(selector);
        if (existing) { rename(existing, label); continue; }
        const summary = drawer.querySelector(`.bao-chat-tool-dialog-body > details[data-chat-tool-group="${name}"] > summary`);
        if (summary) { summary.dataset.baoClarityGroup = name; rename(summary, label); }
      }
      const labels = {
        '另存新檔': '另存手動備份',
        '管理存檔': '手動備份清單',
        '匯入存檔': '匯入備份檔',
        '▤ 故事管理': '故事庫與完整備份',
        'AI 連線／切換模型': '模型連線'
      };
      drawer.querySelectorAll('.bao-chat-tool-proxy').forEach(button => {
        const next = labels[button.textContent.trim()];
        if (next) rename(button, next);
      });
    }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  };
  const start = () => {
    const sidebar = aside();
    if (sidebar) new MutationObserver(schedule).observe(sidebar, { childList: true, subtree: true });
    new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 &&
        (node.id === 'bao-chat-tool-drawer' || node.querySelector?.('#bao-chat-tool-drawer'))))) schedule();
    }).observe(document.body, { childList: true });
    window.BAOChatControlsClarity = Object.freeze({ sync });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
