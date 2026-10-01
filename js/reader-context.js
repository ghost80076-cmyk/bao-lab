(() => {
  'use strict';
  if (window.BAOReaderContext || !window.App) return;

  const desktop = window.matchMedia('(min-width:1081px)');
  let root = null;
  let activeTab = 'current';
  let closeCallback = null;

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/reader-context.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/reader-context.css?v=1';
    document.head.appendChild(link);
  };

  const text = value => {
    const raw = String(value ?? '').trim();
    return raw && !/^(?:未知|未設定|未確認|—|-)$/.test(raw) ? raw : '';
  };

  const sceneNPCs = state => {
    const list = Array.isArray(state?.npcs) ? state.npcs : [];
    const location = text(state?.location);
    return list.filter(npc => {
      if (!npc?.name || npc.presence === 'away') return false;
      const npcLocation = text(npc.location);
      return npc.presence === 'present' || !location || !npcLocation || npcLocation === location;
    });
  };

  const compactValue = (value, depth = 0) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      const parts = value.slice(0, 4).map(item => compactValue(item, depth + 1)).filter(Boolean);
      return parts.join('、') || '—';
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).slice(0, depth ? 3 : 5);
      if (!entries.length) return '—';
      return entries.map(([key, item]) => `${key}：${compactValue(item, depth + 1)}`).join(' · ');
    }
    return String(value);
  };

  const characterStatusRows = name => {
    const state = window.GameState?.current || {};
    const raw = state.characterStatuses?.[name];
    if (!raw || typeof raw !== 'object') return [];
    let cfg = null;
    try { cfg = window.BAOCharacterStatus?.configFor?.(App.activeCharacter); } catch {}
    const fields = Array.isArray(cfg?.fields) ? cfg.fields : [];
    const hidden = new Set(cfg?.customization?.hidden || []);
    const labels = cfg?.customization?.labels || {};
    const ordered = fields
      .filter(field => field?.key && !hidden.has(field.key) && raw[field.key] !== undefined)
      .slice(0, 4)
      .map(field => ({
        label: labels[field.key] || field.label || field.key,
        value: compactValue(raw[field.key])
      }));
    if (ordered.length) return ordered;
    return Object.entries(raw).slice(0, 4).map(([key, value]) => ({ label:key, value:compactValue(value) }));
  };

  const snapshot = () => {
    const state = window.GameState?.current || {};
    const present = sceneNPCs(state);
    const recentEvents = (Array.isArray(state.events) ? state.events : []).filter(Boolean).slice(0, 4);
    const people = [];

    if (App.activeCharacter?.name) {
      people.push({
        name: App.activeCharacter.name,
        role: '主要角色',
        mood: '',
        location: text(state.location),
        relationship: '',
        presence: 'present',
        status: characterStatusRows(App.activeCharacter.name)
      });
    }

    (Array.isArray(state.npcs) ? state.npcs : []).filter(npc => npc?.name).forEach(npc => {
      people.push({
        name: npc.name,
        role: npc.role || 'NPC',
        mood: text(npc.mood),
        location: text(npc.location),
        relationship: npc.relationship === undefined || npc.relationship === null ? '' : String(npc.relationship),
        presence: npc.presence || '',
        status: characterStatusRows(npc.name)
      });
    });

    let worldDefs = [];
    try {
      worldDefs = Array.isArray(state.moduleDefinitions) && state.moduleDefinitions.length
        ? state.moduleDefinitions
        : (window.BAOWorldModules?.definitions?.(App.activeCharacter) || []);
    } catch {}
    const world = worldDefs.map(def => ({
      id: def.id,
      label: def.label || def.id,
      icon: def.icon || '◇',
      context: def.context || '',
      value: state.modules?.[def.id]
    }));

    let memoryDiag = null;
    try { memoryDiag = window.Chat?.memoryDiagnostics?.(App.config || {}) || null; } catch {}

    return {
      current: {
        time: text(state.time) || '未確認',
        location: text(state.location) || '未確認',
        narrative: App.config?.narrativeMode === 'world' ? '世界模擬' : '單角色沉浸',
        scenePeople: present.map(npc => npc.name),
        recentEvents
      },
      people,
      world,
      memory: {
        mode: App.config?.memory?.mode === 'smart' ? '智慧記憶' : '一般記憶',
        summary: String(window.Chat?.summary || '').trim(),
        records: (Array.isArray(state.memory) ? state.memory : []).filter(Boolean).slice(0, 6),
        totalRounds: memoryDiag?.totalRounds || window.Chat?.turnCount?.() || 0,
        coveredRounds: memoryDiag?.coveredRounds || 0
      }
    };
  };

  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };

  const empty = message => {
    const node = el('p', 'reader-context-empty', message);
    return node;
  };

  const sectionTitle = (title, note) => {
    const head = el('div', 'reader-context-section-head');
    head.append(el('h3', '', title));
    if (note) head.append(el('p', '', note));
    return head;
  };

  const factGrid = items => {
    const grid = el('div', 'reader-context-facts');
    items.forEach(item => {
      const card = el('div', 'reader-context-fact');
      card.append(el('small', '', item.label), el('strong', '', item.value || '—'));
      grid.append(card);
    });
    return grid;
  };

  const renderCurrent = (host, data) => {
    host.append(sectionTitle('現況', '只整理目前已確認的故事事實，不把設定工具混進閱讀層。'));
    host.append(factGrid([
      { label:'時間', value:data.current.time },
      { label:'地點', value:data.current.location },
      { label:'敘事模式', value:data.current.narrative },
      { label:'在場人物', value:data.current.scenePeople.length ? data.current.scenePeople.join('、') : '目前未標記' }
    ]));

    const block = el('section', 'reader-context-block');
    block.append(sectionTitle('最近變化', '保留最近幾筆已成立事件，較早內容交給記憶層。'));
    if (!data.current.recentEvents.length) block.append(empty('目前沒有最近事件。'));
    else {
      const list = el('ol', 'reader-context-event-list');
      data.current.recentEvents.forEach(event => list.append(el('li', '', event)));
      block.append(list);
    }
    host.append(block);
  };

  const renderPeople = (host, data) => {
    host.append(sectionTitle('人物', '這裡是閱讀用人物快照；編輯狀態仍留在故事工具。'));
    if (!data.people.length) {
      host.append(empty('目前沒有可顯示的人物。'));
      return;
    }
    const grid = el('div', 'reader-context-people');
    data.people.forEach(person => {
      const card = el('article', 'reader-context-person');
      const top = el('div', 'reader-context-person-head');
      const identity = el('div');
      identity.append(el('strong', '', person.name), el('small', '', person.role));
      const presence = person.presence === 'away' ? '離場' : (person.presence === 'present' ? '在場' : '');
      top.append(identity);
      if (presence) top.append(el('span', 'reader-context-presence', presence));
      card.append(top);

      const meta = [
        person.mood && { label:'情緒', value:person.mood },
        person.location && { label:'位置', value:person.location },
        person.relationship && { label:'關係', value:person.relationship }
      ].filter(Boolean);
      if (meta.length) card.append(factGrid(meta));

      if (person.status.length) {
        const statuses = el('div', 'reader-context-statuses');
        person.status.forEach(item => {
          const row = el('div', 'reader-context-status-row');
          row.append(el('small', '', item.label), el('span', '', item.value));
          statuses.append(row);
        });
        card.append(statuses);
      }
      grid.append(card);
    });
    host.append(grid);
  };

  const renderWorld = (host, data) => {
    host.append(sectionTitle('世界', '只顯示目前故事正在使用的世界模組；開關與欄位管理留在工具模式。'));
    if (!data.world.length) {
      host.append(empty('這個故事目前沒有啟用世界模組。'));
      return;
    }
    const list = el('div', 'reader-context-world-list');
    data.world.forEach(item => {
      const card = el('article', 'reader-context-world-card');
      const head = el('div', 'reader-context-world-head');
      head.append(el('strong', '', `${item.icon} ${item.label}`));
      if (item.context) {
        const contextLabel = item.context === 'core' ? '核心' : item.context === 'relevant' ? '相關時' : '只顯示';
        head.append(el('span', 'reader-context-context', contextLabel));
      }
      card.append(head, el('p', '', compactValue(item.value)));
      list.append(card);
    });
    host.append(list);
  };

  const renderMemory = (host, data) => {
    host.append(sectionTitle('記憶', '閱讀層只回答「目前記住了什麼」，不顯示 Token 工程設定。'));
    host.append(factGrid([
      { label:'記憶模式', value:data.memory.mode },
      { label:'故事輪次', value:data.memory.totalRounds ? `${data.memory.totalRounds} 輪` : '尚無資料' }
    ]));

    const summary = el('section', 'reader-context-block');
    summary.append(sectionTitle('長期摘要'));
    summary.append(data.memory.summary ? el('p', 'reader-context-prose', data.memory.summary) : empty('目前尚未產生長期摘要。'));
    host.append(summary);

    if (data.memory.records.length) {
      const records = el('section', 'reader-context-block');
      records.append(sectionTitle('故事記錄'));
      const list = el('ul', 'reader-context-memory-list');
      data.memory.records.forEach(item => list.append(el('li', '', item)));
      records.append(list);
      host.append(records);
    }
  };

  const render = () => {
    if (!root?.isConnected) return;
    const host = root.querySelector('[data-reader-context-content]');
    if (!host) return;
    const data = snapshot();
    host.replaceChildren();
    if (activeTab === 'people') renderPeople(host, data);
    else if (activeTab === 'world') renderWorld(host, data);
    else if (activeTab === 'memory') renderMemory(host, data);
    else renderCurrent(host, data);

    root.querySelectorAll('[data-reader-context-tab]').forEach(button => {
      const active = button.dataset.readerContextTab === activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
  };

  const close = ({ notify = true } = {}) => {
    const callback = closeCallback;
    closeCallback = null;
    root?.remove();
    root = null;
    document.body.classList.remove('bao-reader-context-open');
    if (notify) callback?.();
  };

  const mount = () => {
    ensureStyles();
    root?.remove();
    root = document.createElement('div');
    root.id = 'bao-reader-context';
    root.className = 'reader-context-root';
    root.innerHTML = `
      <aside class="reader-context-panel" role="dialog" aria-modal="false" aria-labelledby="bao-reader-context-title">
        <header class="reader-context-head">
          <div>
            <div class="eyebrow">STORY CONTEXT</div>
            <h2 id="bao-reader-context-title">故事資訊</h2>
            <p>閱讀時查看已確認的現況，不在這裡修改故事設定。</p>
          </div>
          <button type="button" class="reader-context-close" data-reader-context-close aria-label="關閉故事資訊">×</button>
        </header>
        <nav class="reader-context-tabs" role="tablist" aria-label="故事資訊分類">
          <button type="button" role="tab" data-reader-context-tab="current">現況</button>
          <button type="button" role="tab" data-reader-context-tab="people">人物</button>
          <button type="button" role="tab" data-reader-context-tab="world">世界</button>
          <button type="button" role="tab" data-reader-context-tab="memory">記憶</button>
        </nav>
        <div class="reader-context-content" data-reader-context-content></div>
        <footer class="reader-context-foot">只顯示已確認資訊 · 要修改設定請開啟「工具」</footer>
      </aside>`;
    document.body.append(root);
    document.body.classList.add('bao-reader-context-open');

    root.querySelector('[data-reader-context-close]')?.addEventListener('click', () => close());
    root.querySelectorAll('[data-reader-context-tab]').forEach(button => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.readerContextTab || 'current';
        render();
      });
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...root.querySelectorAll('[data-reader-context-tab]')];
        const index = tabs.indexOf(event.currentTarget);
        const next = event.key === 'ArrowRight'
          ? tabs[(index + 1) % tabs.length]
          : tabs[(index - 1 + tabs.length) % tabs.length];
        next?.focus();
        next?.click();
      });
    });
    render();
    root.querySelector('[data-reader-context-close]')?.focus();
  };

  const open = (options = {}) => {
    if (!desktop.matches) return false;
    close({ notify:false });
    closeCallback = typeof options.onClose === 'function' ? options.onClose : null;
    activeTab = options.tab || 'current';
    mount();
    return true;
  };

  const sync = () => {
    if (root?.isConnected) render();
  };

  desktop.addEventListener?.('change', event => {
    if (!event.matches) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root?.isConnected) close();
  });

  window.BAOReaderContext = Object.freeze({
    open,
    close,
    sync,
    snapshot,
    get isOpen() { return Boolean(root?.isConnected); }
  });
})();