(() => {
  'use strict';
  if (window.BAOFeatureHelp) return;

  const TOPICS = Object.freeze({
    info_panel: {
      title: '資訊面板',
      body: '這裡集中人物、角色狀態、事件、記憶與作品自訂分頁。它是閱讀中的資訊面板，不等同於世界狀態。'
    },
    world_status: {
      title: '世界狀態',
      body: '顯示目前故事已確認的時間、地點、人物與世界狀態。資料由共用狀態系統讀取，不會另外建立第二份世界資料。'
    },
    tools: {
      title: '故事工具',
      body: '存檔、模型、狀態欄管理、顯示方式與其他進階設定集中在這裡。一般閱讀不需要一直開著。'
    },
    memory: {
      title: '故事記憶',
      body: '查看長期記憶與整理結果。最近劇情仍以原始對話為主，較早內容才會依你的記憶設定逐步整理。'
    },
    next_turn_reference: {
      title: '下一輪重點',
      body: '點選人物後，夜灣只會在下一次送出訊息時優先帶入這些人物的相關狀態。可同時選最多 4 人；再次點擊即可取消。這不代表人物目前在場，也不會把人物加入場景；場景參與請到「NPC 名冊／場景」管理。成功完成下一輪後會自動清除；如果 API 請求失敗，選取會保留。'
    },
    three_realms: {
      title: '三界功能怎麼選',
      body: '世界書：在世界書資料庫選擇需要的三界背景包，按故事情境帶入。\n三界修煉：在世界模組管理啟用，查看故事已確認的境界、力量與業力。\n三界故事引導：啟用後開啟快捷指令，選事件、人物構思、查詢或世界構思；填入輸入框後由你送出。世界構思先提供方案。\n原創人物範本：在本故事的人物設定選擇三界原創人物，先改名或調整身份，再套用。\n三界人物狀態：在狀態欄管理選擇文字範本，顯示已確認的身體、精神與關係；未知欄位顯示未確認。\n這些功能都可按故事需要分開選用。'
    },
    status_manager: {
      title: '狀態欄管理',
      body: '調整目前故事要顯示與追蹤的欄位。設定只寫入這份故事存檔，不會改壞原始角色卡。'
    }
  });

  const ensureStyle = () => {
    if (document.getElementById('bao-feature-help-style')) return;
    const style = document.createElement('style');
    style.id = 'bao-feature-help-style';
    style.textContent = `
      .bao-help-button{display:inline-grid!important;place-items:center!important;width:24px!important;min-width:24px!important;height:24px!important;min-height:24px!important;padding:0!important;margin:0 2px!important;border:1px solid rgba(190,183,226,.32)!important;border-radius:999px!important;background:rgba(127,106,184,.12)!important;color:#d9d4ea!important;font:700 12px/1 system-ui,sans-serif!important;vertical-align:middle;cursor:pointer}
      .bao-help-button:hover,.bao-help-button:focus-visible{background:rgba(127,106,184,.24)!important;color:#fff!important;outline:none}
      #bao-feature-help-backdrop{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;padding:16px;background:#000b}
      #bao-feature-help-dialog{box-sizing:border-box;width:min(440px,100%);max-height:min(80dvh,640px);overflow:auto;padding:18px;border:1px solid rgba(205,190,234,.25);border-radius:18px;background:#171923;color:#f6f3fa;box-shadow:0 24px 72px #000a}
      #bao-feature-help-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}
      #bao-feature-help-dialog h2{margin:0;font-size:19px}
      #bao-feature-help-dialog p{margin:14px 0 0;color:#c9c5d2;line-height:1.75;font-size:14px;white-space:pre-wrap}
      #bao-feature-help-dialog [data-close]{width:auto;min-width:36px;min-height:36px}
    `;
    document.head.append(style);
  };

  const close = () => document.getElementById('bao-feature-help-backdrop')?.remove();

  const open = topic => {
    const item = typeof topic === 'string' ? TOPICS[topic] : topic;
    if (!item) return false;
    ensureStyle();
    close();
    const prior = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.id = 'bao-feature-help-backdrop';
    backdrop.innerHTML = `<section id="bao-feature-help-dialog" role="dialog" aria-modal="true"><header><h2></h2><button type="button" class="secondary" data-close aria-label="關閉說明">×</button></header><p></p></section>`;
    backdrop.querySelector('h2').textContent = item.title;
    backdrop.querySelector('p').textContent = item.body;
    const dismiss = () => { close(); prior?.focus?.(); };
    backdrop.querySelector('[data-close]').addEventListener('click', dismiss);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) dismiss(); });
    backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(); });
    document.body.append(backdrop);
    backdrop.querySelector('[data-close]').focus();
    return true;
  };

  const button = (topic, label = '?') => {
    const item = TOPICS[topic];
    if (!item) return null;
    ensureStyle();
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'bao-help-button';
    node.dataset.baoHelp = topic;
    node.textContent = label;
    node.setAttribute('aria-label', `了解${item.title}`);
    node.title = `了解${item.title}`;
    return node;
  };

  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-bao-help]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    open(trigger.dataset.baoHelp);
  });

  ensureStyle();
  window.BAOFeatureHelp = Object.freeze({ TOPICS, open, close, button });
})();