/* A presentation-only path through the existing builder. All config is still
 * collected and validated by App.startStory and its existing extensions. */
(() => {
  'use strict';
  if (!window.App || window.BAOQuickSetup) return;
  const view = document.getElementById('builder-view');
  if (!view) return;
  const $ = id => document.getElementById(id);
  const specialWorld = () => App.activeCharacter?.id === 'autonomous-npc-world';
  let wasVisible = view.classList.contains('active');
  const style = document.createElement('style');
  style.id = 'bao-quick-setup-style';
  style.textContent = `
    #bao-setup-choice{display:grid;gap:14px;margin:15px 0 18px;padding:17px;border:1px solid #444b5d;border-radius:16px;background:#171d28}
    #bao-setup-choice h3{margin:0;font-size:18px}
    #bao-setup-choice p{margin:0;color:#c3cbd9;font-size:13px;line-height:1.65}
    .bao-first-run-progress{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}
    .bao-first-run-progress li{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(7,10,16,.42)}
    .bao-first-run-progress li>span{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#2a3040;color:#b8c0d2;font-size:11px;font-weight:800}
    .bao-first-run-progress b{display:block;color:#e8e5ec;font-size:12px;line-height:1.35}
    .bao-first-run-progress small{display:block;margin-top:2px;color:#878d9c;font-size:9px;line-height:1.45}
    .bao-first-run-progress li.is-done{border-color:rgba(117,223,206,.18)}
    .bao-first-run-progress li.is-done>span{background:#193a37;color:#c9fff6}
    .bao-first-run-progress li.is-current{border-color:rgba(177,156,255,.32);background:rgba(125,99,208,.09)}
    .bao-first-run-progress li.is-current>span{background:#6d5bb2;color:#fff}
    .bao-setup-mode-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
    .bao-setup-mode-copy{display:grid;gap:4px}
    .bao-setup-mode-copy small{color:#8e94a2;font-size:10px;line-height:1.5}
    .bao-setup-buttons{display:flex;flex-wrap:wrap;gap:8px}
    .bao-setup-buttons button{min-height:38px;padding:8px 12px;flex:0 1 auto;text-align:center}
    .bao-setup-buttons button[data-bao-setup="quick"][aria-pressed="true"]{border:1px solid #75dfce;background:#193a37;color:#e8fffa;font-weight:800}
    .bao-setup-buttons button[data-bao-setup="advanced"]{background:transparent;border-color:rgba(255,255,255,.12);color:#b8bdc9}
    .bao-setup-buttons button[data-bao-setup="advanced"][aria-pressed="true"]{border-color:#aa97ff;background:rgba(170,151,255,.12);color:#eee8ff;font-weight:800}
    .bao-setup-buttons button:disabled{opacity:.5;cursor:not-allowed}
    #bao-quick-intro{margin:0 0 14px;padding:13px 15px;border:1px solid #40534e;border-radius:12px;background:#142722;color:#defcf5;line-height:1.65;font-size:14px}
    #bao-quick-intro a{color:#e8d1ff}
    #bao-quick-extra{margin:13px 0 0}
    #bao-quick-extra button{width:auto;min-height:38px}
    #bao-quick-extra p{margin:8px 0 0;color:#c3cbd9;font-size:12px}
    #builder-view[data-bao-setup="advanced"] #bao-quick-intro,#builder-view[data-bao-setup="advanced"] #bao-quick-extra,#builder-view[data-bao-setup="advanced"] .bao-first-run-progress{display:none!important}
    #builder-view[data-bao-setup="quick"] .steps,
    #builder-view[data-bao-setup="quick"] #prev-step,
    #builder-view[data-bao-setup="quick"] #next-step,
    #builder-view[data-bao-setup="quick"] .builder-step:not([data-step-panel="4"]){display:none!important}
    #builder-view[data-bao-setup="quick"] .builder-step[data-step-panel="4"]{display:block!important}
    #builder-view[data-bao-setup="quick"] #start-story{display:inline-flex!important;align-items:center;justify-content:center;min-height:45px}
    #builder-view[data-bao-setup="quick"]:not(.bao-quick-custom):not(.bao-quick-advanced) .bao-quick-technical,
    #builder-view[data-bao-setup="quick"]:not(.bao-quick-custom):not(.bao-quick-advanced) .bao-model-discovery{display:none!important}
    @media(max-width:600px){#bao-setup-choice{padding:13px}.bao-first-run-progress{grid-template-columns:1fr}.bao-first-run-progress li{grid-template-columns:26px minmax(0,1fr);padding:8px}.bao-first-run-progress li>span{width:26px;height:26px}.bao-setup-mode-head{display:grid}.bao-setup-buttons{display:grid;grid-template-columns:1fr}.bao-setup-buttons button{width:100%}}
  `;
  document.head.append(style);

  function markTechnicalFields() {
    ['model-id', 'base-url', 'bao-builder-discovery-protocol'].forEach(id => {
      $(id)?.closest('label')?.classList.add('bao-quick-technical');
    });
  }
  function updateTechnicalVisibility() {
    markTechnicalFields();
    const preset = App.getSelectedPreset?.();
    const needsFields = !preset?.model || !preset?.base_url || preset?.route === 'custom';
    view.classList.toggle('bao-quick-custom', needsFields);
    const expanded = needsFields || view.classList.contains('bao-quick-advanced');
    const advancedDetails = $('api-advanced-settings');
    if (advancedDetails && view.dataset.baoSetup === 'quick') advancedDetails.open = expanded;
    const button = $('bao-quick-technical-toggle');
    if (button) {
      button.hidden = needsFields || view.dataset.baoSetup !== 'quick';
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = view.classList.contains('bao-quick-advanced') ? '收起進階連線欄位' : '展開進階連線欄位';
    }
    const tip = $('bao-quick-api-tip');
    if (tip) tip.textContent = needsFields
      ? '這個 AI 服務需要自己填入模型代號或連線網址；不確定怎麼填，可以先選有完整預設的服務。'
      : '模型代號和連線網址已帶入預設值；一般情況只要貼上相符的連線金鑰（API Key）。';
  }
  function ensureUI() {
    if ($('bao-setup-choice')) return;
    const stepper = view.querySelector('.steps');
    if (!stepper) return;
    const choice = document.createElement('section');
    choice.id = 'bao-setup-choice';
    choice.setAttribute('aria-label', '建立故事的操作方式');
    choice.innerHTML = `
      <ol class="bao-first-run-progress" aria-label="開始故事三步驟">
        <li class="is-done"><span>1</span><div><b>作品已選好</b><small id="bao-setup-story-name">目前作品</small></div></li>
        <li class="is-current"><span>2</span><div><b>連接 AI</b><small id="bao-first-run-ai-note">選擇連線方式與模型</small></div></li>
        <li><span>3</span><div><b>開始故事</b><small>完成連線後直接進入故事</small></div></li>
      </ol>
      <div class="bao-setup-mode-head">
        <div class="bao-setup-mode-copy"><h3>快速開始</h3><p id="bao-setup-note">只處理 AI 連線，其餘先用適合一般故事的預設值。</p><small>想自己調整敘事、Persona 或記憶，再切到完整設定。</small></div>
        <div class="bao-setup-buttons">
          <button type="button" class="secondary" data-bao-setup="quick" aria-pressed="false">快速開始（推薦）</button>
          <button type="button" class="secondary" data-bao-setup="advanced" aria-pressed="false">完整設定</button>
        </div>
      </div>`;
    stepper.before(choice);
    choice.querySelectorAll('[data-bao-setup]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.baoSetup)));
    const panel = view.querySelector('.builder-step[data-step-panel="4"]');
    if (!panel) return;
    const intro = document.createElement('div');
    intro.id = 'bao-quick-intro';
    intro.innerHTML = '選擇 AI 服務商、選擇 AI 模型，再貼上自己的連線金鑰（API Key），就能開始。<br>還沒有金鑰？<a href="quick-start.html" target="_blank" rel="noopener noreferrer">看三步驟教學 ↗</a>　<a href="api-guide.html" target="_blank" rel="noopener noreferrer">完整連線說明（API）↗</a>';
    panel.querySelector('h3')?.insertAdjacentElement('afterend', intro);
    const extra = document.createElement('div');
    extra.id = 'bao-quick-extra';
    extra.innerHTML = '<button id="bao-quick-technical-toggle" type="button" class="secondary" aria-expanded="false">展開進階連線欄位</button><p id="bao-quick-api-tip" role="status"></p>';
    panel.append(extra);
    $('bao-quick-technical-toggle').addEventListener('click', () => {
      view.classList.toggle('bao-quick-advanced');
      updateTechnicalVisibility();
    });
    ['api-type', 'model-select', 'model-id', 'base-url'].forEach(id => $(id)?.addEventListener('change', updateTechnicalVisibility));
    updateTechnicalVisibility();
  }
  function setMode(mode, preserveStep = false) {
    ensureUI();
    if (mode === 'quick' && specialWorld()) return;
    view.dataset.baoSetup = mode === 'advanced' ? 'advanced' : 'quick';
    view.classList.remove('bao-quick-advanced');
    view.querySelectorAll('#bao-setup-choice [data-bao-setup]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.baoSetup === view.dataset.baoSetup));
    });
    if (!preserveStep) App.setStep(view.dataset.baoSetup === 'quick' ? 4 : 1);
    updateTechnicalVisibility();
  }
  // Preserve existing scripted flows, including resume, demo and tests which
  // explicitly navigate to step 5 after opening the builder.
  const originalSetStep = App.setStep;
  App.setStep = function(step) {
    if (view.classList.contains('active') && view.dataset.baoSetup === 'quick' && Number(step) !== 4) {
      view.dataset.baoSetup = 'advanced';
      view.querySelectorAll('#bao-setup-choice [data-bao-setup]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.baoSetup === 'advanced'));
      });
      updateTechnicalVisibility();
    }
    return originalSetStep.call(this, step);
  };
  function shown() {
    ensureUI();
    const restricted = specialWorld();
    const quick = view.querySelector('#bao-setup-choice [data-bao-setup="quick"]');
    if (quick) quick.disabled = restricted;
    const storyName = $('bao-setup-story-name');
    if (storyName) storyName.textContent = App.activeCharacter?.name || '目前作品';
    const note = $('bao-setup-note');
    if (note) note.textContent = restricted
      ? '這個世界需要先選開局方式與世界觀，因此使用完整設定。'
      : '只處理 AI 連線；敘事、玩家身份（Persona）與記憶先沿用預設值。';
    // If an existing flow selected another step, never silently override it.
    setMode(restricted || App.currentStep !== 1 ? 'advanced' : 'quick', restricted || App.currentStep !== 1);
    // PlayerBuilder may have initialized before this progress UI existed.
    // Re-sync once the nodes are present so Step 2 immediately reflects the active route.
    queueMicrotask(() => window.BAOPlayerBuilderV2?.sync?.());
  }
  const observer = new MutationObserver(() => {
    const visible = view.classList.contains('active');
    if (visible && !wasVisible) shown();
    wasVisible = visible;
  });
  observer.observe(view, { attributes: true, attributeFilter: ['class'] });
  if (wasVisible) shown();
  window.BAOQuickSetup = { setMode, updateTechnicalVisibility };
})();
