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
    #bao-setup-choice{display:grid;gap:12px;margin:15px 0 18px;padding:17px;border:1px solid #444b5d;border-radius:16px;background:#171d28}
    #bao-setup-choice h3{margin:0;font-size:18px}
    #bao-setup-choice p{margin:0;color:#c3cbd9;font-size:13px;line-height:1.65}
    .bao-setup-buttons{display:flex;flex-wrap:wrap;gap:9px}
    .bao-setup-buttons button{min-height:42px;flex:1 1 155px;text-align:center}
    .bao-setup-buttons button[aria-pressed="true"]{border:1px solid #75dfce;background:#193a37;color:#e8fffa;font-weight:800}
    .bao-setup-buttons button:disabled{opacity:.5;cursor:not-allowed}
    #bao-quick-intro{margin:0 0 14px;padding:13px 15px;border:1px solid #40534e;border-radius:12px;background:#142722;color:#defcf5;line-height:1.65;font-size:14px}
    #bao-quick-intro a{color:#e8d1ff}
    #bao-quick-extra{margin:13px 0 0}
    #bao-quick-extra button{width:auto;min-height:38px}
    #bao-quick-extra p{margin:8px 0 0;color:#c3cbd9;font-size:12px}
    #builder-view[data-bao-setup="advanced"] #bao-quick-intro,#builder-view[data-bao-setup="advanced"] #bao-quick-extra{display:none!important}
    #builder-view[data-bao-setup="quick"] .steps,
    #builder-view[data-bao-setup="quick"] #prev-step,
    #builder-view[data-bao-setup="quick"] #next-step,
    #builder-view[data-bao-setup="quick"] .builder-step:not([data-step-panel="4"]){display:none!important}
    #builder-view[data-bao-setup="quick"] .builder-step[data-step-panel="4"]{display:block!important}
    #builder-view[data-bao-setup="quick"] #start-story{display:inline-flex!important;align-items:center;justify-content:center;min-height:45px}
    #builder-view[data-bao-setup="quick"]:not(.bao-quick-custom):not(.bao-quick-advanced) .bao-quick-technical,
    #builder-view[data-bao-setup="quick"]:not(.bao-quick-custom):not(.bao-quick-advanced) .bao-model-discovery{display:none!important}
    @media(max-width:600px){#bao-setup-choice{padding:13px}.bao-setup-buttons{flex-direction:column}.bao-setup-buttons button{flex:0 0 auto;width:100%}}
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
    const button = $('bao-quick-technical-toggle');
    if (button) {
      button.hidden = needsFields || view.dataset.baoSetup !== 'quick';
      button.setAttribute('aria-expanded', String(view.classList.contains('bao-quick-advanced')));
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
    choice.innerHTML = '<h3>想怎麼開始？</h3><div class="bao-setup-buttons"><button type="button" class="secondary" data-bao-setup="quick" aria-pressed="false">快速開始 · 只連接 AI</button><button type="button" class="secondary" data-bao-setup="advanced" aria-pressed="false">完整設定 · 自訂故事</button></div><p id="bao-setup-note">第一次來可以先用預設設定，之後仍可調整記憶和故事功能。</p>';
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
    extra.innerHTML = '<button id="bao-quick-technical-toggle" type="button" class="secondary" aria-expanded="false">展開進階連線欄位</button><p id="bao-quick-api-tip" role="status"></p><p>連線金鑰（API Key）不會寫進故事備份。實際費用和免費額度依你選的 AI 服務商而定。</p>';
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
    const note = $('bao-setup-note');
    if (note) note.textContent = restricted
      ? '這個世界需要先選開局方式與世界觀，請使用完整設定；原本的功能都會保留。'
      : '快速開始只顯示 AI 連線；敘事、玩家資料（Persona）與記憶會沿用原本的預設值，隨時可切回完整設定。';
    // If an existing flow selected another step, never silently override it.
    setMode(restricted || App.currentStep !== 1 ? 'advanced' : 'quick', restricted || App.currentStep !== 1);
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
