/* BAO/LAB Doctor v1: static authoring diagnostics with explicit runtime boundaries. */
(() => {
  'use strict';

  const LAYERS = [
    { id: 'structure', label: '結構與必填' },
    { id: 'character', label: '角色核心與開場' },
    { id: 'world', label: '世界與 NPC' },
    { id: 'longplay', label: '長篇循環' },
    { id: 'presentation', label: '呈現與作者控制' },
    { id: 'runtime', label: 'Runtime／記憶／Context' }
  ];
  const SEVERITY_ORDER = { blocker: 0, warning: 1, info: 2 };

  const text = value => String(value ?? '').trim();
  const array = value => Array.isArray(value) ? value : [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function addFinding(findings, layer, severity, problem, evidence, action) {
    findings.push({
      layer,
      severity,
      problem: text(problem),
      evidence: text(evidence),
      action: text(action)
    });
  }

  function normalizedCard(raw) {
    if (!window.CharacterEngine?.normalize) throw new Error('CharacterEngine 尚未載入，無法執行 BAO Doctor。');
    return window.CharacterEngine.normalize(raw || {});
  }

  function readinessFor(raw) {
    if (window.BAOCharacterReadiness?.audit) return window.BAOCharacterReadiness.audit(raw || {});
    if (typeof window.CharacterEngine?.audit === 'function') return window.CharacterEngine.audit(raw || {});
    return {
      ok: true,
      ready: false,
      longFormReady: false,
      score: null,
      grade: '',
      errors: [],
      warnings: [],
      recommendations: [],
      sections: []
    };
  }

  function layerStatus(layerId, findings) {
    if (layerId === 'runtime') return 'not-tested';
    const related = findings.filter(item => item.layer === layerId);
    if (related.some(item => item.severity === 'blocker')) return 'blocked';
    if (related.some(item => item.severity === 'warning')) return 'attention';
    return 'ok';
  }

  function analyze(raw = {}) {
    const card = normalizedCard(raw);
    const readiness = readinessFor(raw);
    const findings = [];

    unique(readiness.errors || []).forEach(error => {
      addFinding(
        findings,
        'structure',
        'blocker',
        error,
        '既有角色卡驗證器已判定這是阻擋性問題。',
        '先修正這個結構問題，再做角色品質或長篇診斷。'
      );
    });

    const prompt = text(card.system_prompt);
    const greeting = text(card.greeting);
    const profile = object(card.profile) ? card.profile : {};
    if (prompt && prompt.length < 80) {
      addFinding(
        findings,
        'character',
        'warning',
        '核心設定偏短，長篇時角色行為容易只靠模型臨場補完。',
        `system_prompt 目前約 ${prompt.length} 字。`,
        '補角色慾望、矛盾、行為邏輯、語氣與穩定邊界；不要單純堆外貌或形容詞。'
      );
    }
    if (greeting && greeting.length < 30) {
      addFinding(
        findings,
        'character',
        'warning',
        '開場提供的可行動資訊偏少。',
        `greeting 目前約 ${greeting.length} 字。`,
        '補當下場景、角色正在做什麼，以及玩家可以自然回應的壓力或鉤子。'
      );
    }
    if (!Object.keys(profile).length && prompt.length < 500) {
      addFinding(
        findings,
        'character',
        'info',
        '人物補充資料很少。',
        'profile 為空，核心設定也未達較完整的長篇描述量。',
        '只有實際試玩出現人格漂移時再補人物錨點；不要為了分數硬塞資料。'
      );
    }

    const worldMode = card.supported_modes?.world === true;
    if (worldMode) {
      if (!text(card.world)) {
        addFinding(
          findings,
          'world',
          'warning',
          '已開啟世界／多 NPC 模式，但沒有世界運作規則。',
          'supported_modes.world=true，而 world 為空。',
          '補世界的固定規則、社會／力量邏輯與不能被模型隨意改寫的邊界。'
        );
      }
      if (!array(card.world_focus).length) {
        addFinding(
          findings,
          'world',
          'warning',
          '沒有明確的世界持續關注點。',
          'world_focus 為空。',
          '列出少量真正需要跨回合維持的世界元素；不要把整份百科搬進去。'
        );
      }
      if (!text(card.npc_rules)) {
        addFinding(
          findings,
          'world',
          'info',
          '沒有作品專屬 NPC 規則。',
          'npc_rules 為空；夜灣仍有平台內建的基本 NPC 自主規則。',
          '若作品需要特殊日程、資訊隔離、離場或陣營規則再補；沒有特殊需求可維持空白。'
        );
      }
      const initial = object(card.initial_state) ? card.initial_state : {};
      if (!text(initial.time) || !text(initial.location)) {
        addFinding(
          findings,
          'longplay',
          'warning',
          '世界模式缺少清楚的初始時間或地點。',
          `initial_state.time=${JSON.stringify(initial.time || '')}；location=${JSON.stringify(initial.location || '')}。`,
          '提供初始時間與地點，讓後續世界狀態、事件與 NPC 位置有可追蹤起點。'
        );
      }
      const modules = array(card.world_modules);
      const statusFields = array(card.character_status?.fields);
      const dynamicPrompts = array(card.dynamic_prompts);
      if (!modules.length && !statusFields.length && !dynamicPrompts.length) {
        addFinding(
          findings,
          'longplay',
          'info',
          '目前沒有顯式進程模組。',
          'world_modules、character_status.fields、dynamic_prompts 都是空的。',
          '這不一定是問題；先實玩。如果關係、資源、任務或世界事件容易漂移，再只加入真正需要追蹤的狀態。'
        );
      }
    }

    const hasStructuralBlocker = findings.some(item => item.layer === 'structure' && item.severity === 'blocker');
    if (!hasStructuralBlocker && readiness.ready && !readiness.longFormReady) {
      addFinding(
        findings,
        'longplay',
        'warning',
        '目前可開始測玩，但尚未達靜態長篇測試門檻。',
        readiness.score === null
          ? '既有 readiness 判定 ready=true、longFormReady=false。'
          : `既有 readiness：${readiness.score}/100${readiness.grade ? ` · ${readiness.grade}` : ''}；longFormReady=false。`,
        '先修上方已有證據的角色／世界問題，再實玩 10～20 輪；不要為了把分數補滿而新增無用途狀態。'
      );
    } else if (!hasStructuralBlocker && !readiness.ready) {
      addFinding(
        findings,
        'longplay',
        'warning',
        '目前靜態準備度還不適合直接判定長篇品質。',
        readiness.score === null
          ? '既有 readiness 判定 ready=false。'
          : `既有 readiness：${readiness.score}/100${readiness.grade ? ` · ${readiness.grade}` : ''}；ready=false。`,
        '先處理已有證據的設定缺口；達到可測玩後，真正的長篇品質仍需靠實際對話驗證。'
      );
    }

    const supported = object(card.supported_display) ? card.supported_display : {};
    if (supported.ui === true && !array(card.ui?.panels).length) {
      addFinding(
        findings,
        'presentation',
        'warning',
        '已啟用互動 UI，但沒有可顯示的 panels。',
        'supported_display.ui=true，ui.panels 為空。',
        '建立實際有用途的面板，或關閉 UI 模式避免留下空殼設定。'
      );
    }
    if (!text(card.author_instructions)) {
      addFinding(
        findings,
        'presentation',
        'info',
        '沒有作品專屬敘事偏好。',
        'author_instructions 為空。',
        '若作品有固定鏡頭、節奏或資訊揭露方式再補；不要重複 system_prompt 已有規則。'
      );
    }

    const layers = LAYERS.map(layer => ({
      ...layer,
      status: layerStatus(layer.id, findings),
      findings: findings
        .filter(item => item.layer === layer.id)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    }));

    const blockers = findings.filter(item => item.severity === 'blocker');
    let nextStep;
    if (blockers.length) {
      nextStep = '先修阻擋性結構問題，再重新執行 BAO Doctor。';
    } else if (readiness.longFormReady) {
      nextStep = '這張卡已達靜態長篇測試門檻。下一步應實玩 10～20 輪，再用故事證據檢查記憶、Context、狀態與模型跑偏；不要繼續為了分數加設定。';
    } else if (readiness.ready) {
      nextStep = '可以先實玩 10～20 輪。只有實際出現人格漂移、世界斷裂或進程停滯時，再補對應層。';
    } else {
      nextStep = '先依上方警告補到可測玩，不需要追求滿分；真正的長篇品質必須靠實際對話驗證。';
    }

    return {
      version: 1,
      scope: 'static-card',
      title: card.name || '未命名角色',
      readiness: {
        ready: Boolean(readiness.ready),
        longFormReady: Boolean(readiness.longFormReady),
        score: Number.isFinite(readiness.score) ? readiness.score : null,
        grade: text(readiness.grade)
      },
      findings: findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
      layers,
      nextStep,
      runtimeBoundary: '本次只分析目前角色卡。尚未讀取實際故事、記憶摘要、送模 Context、世界狀態更新紀錄或模型回覆，因此 Runtime 層固定標示「未實測」。'
    };
  }

  const statusLabel = status => ({
    blocked: '需先修正',
    attention: '需要注意',
    ok: '目前無明顯問題',
    'not-tested': '未實測'
  }[status] || status);

  const severityLabel = severity => ({
    blocker: '阻擋',
    warning: '注意',
    info: '觀察'
  }[severity] || severity);

  function reportHTML(report, displayName = '') {
    const name = displayName || report.title || '角色卡';
    const score = report.readiness.score === null
      ? ''
      : `<b style="font-size:28px">${report.readiness.score}</b><span>/100${report.readiness.grade ? ` · ${escape(report.readiness.grade)}` : ''}</span>`;
    const layerCards = report.layers.map(layer => `
      <article style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px">
        <b>${escape(layer.label)}</b><br>
        <span class="note">${escape(statusLabel(layer.status))}</span>
      </article>`).join('');
    const findings = report.findings.length
      ? report.findings.map(item => `
          <li style="margin:12px 0">
            <b>[${escape(severityLabel(item.severity))}] ${escape(item.problem)}</b>
            <div class="note">證據：${escape(item.evidence)}</div>
            <div>建議：${escape(item.action)}</div>
          </li>`).join('')
      : '<li>目前靜態檢查沒有找到需要修改的項目。</li>';

    return `
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
        <div><div class="eyebrow">BAO DOCTOR v1</div><h2 style="margin:4px 0">${escape(name)}</h2><p class="note">靜態角色卡分層診斷</p></div>
        <div style="text-align:right">${score}</div>
      </div>
      <p class="note" style="margin-top:14px">${escape(report.runtimeBoundary)}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:16px">${layerCards}</div>
      <section style="margin-top:18px"><h3>診斷結果</h3><ul style="padding-left:20px">${findings}</ul></section>
      <section style="margin-top:18px"><h3>下一步</h3><p>${escape(report.nextStep)}</p></section>
    `;
  }

  function show(report, displayName = '') {
    if (typeof document === 'undefined' || !document.body) return report;
    document.getElementById('bao-doctor-modal')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'bao-doctor-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px';
    wrap.innerHTML = `<section role="dialog" aria-modal="true" aria-label="BAO Doctor" style="width:min(860px,100%);max-height:90vh;overflow:auto;background:var(--panel,#151515);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:24px"><button type="button" class="text-button" data-close style="float:right">關閉</button>${reportHTML(report, displayName)}</section>`;
    const close = () => wrap.remove();
    wrap.querySelector('[data-close]')?.addEventListener('click', close);
    wrap.addEventListener('click', event => { if (event.target === wrap) close(); });
    document.body.appendChild(wrap);
    return report;
  }

  function mountStudio() {
    if (typeof document === 'undefined') return false;
    const button = document.getElementById('studio-doctor');
    if (!button || button.dataset.baoDoctorReady === '1') return false;
    button.dataset.baoDoctorReady = '1';
    button.addEventListener('click', () => {
      try {
        const card = window.BAOCharacterStudio?.readCard?.();
        if (!card) throw new Error('角色卡創作室尚未準備完成。');
        show(analyze(card), card.name || '目前草稿');
      } catch (error) {
        window.alert?.(error?.message || 'BAO Doctor 無法分析目前草稿。');
      }
    });
    return true;
  }

  window.BAODoctor = { version: 1, analyze, reportHTML, show, mountStudio, layers: LAYERS.map(layer => ({ ...layer })) };
  mountStudio();
})();
