/* BAO/LAB Gameplay UI preview page controller. Loaded AFTER gameplay-ui.js.
 *
 * Receives a gameplay_ui schema and a test state from the parent window through postMessage,
 * renders them with the production renderer, and reports what it rendered. The state lives only
 * in this document; reloading the iframe resets it.
 */
(() => {
  'use strict';
  const Protocol = window.BAOGameplayUIPreviewProtocol;
  const Iso = window.BAOPreviewIsolation;
  const UI = window.BAOGameplayUI;
  const Stage = window.BAOStageCapabilityCore;
  const root = document.getElementById('game-ui');
  const tabs = document.getElementById('preview-tabs');
  const panelHost = document.getElementById('ui-panel');
  const fidelityNote = document.getElementById('preview-fidelity');
  if (!Protocol || !Iso || !UI || !root || !tabs || !panelHost) throw new Error('preview page is missing a dependency');

  const clone = value => JSON.parse(JSON.stringify(value ?? null));
  const baseState = state => {
    const next = state && typeof state === 'object' && !Array.isArray(state) ? clone(state) : {};
    if (!Array.isArray(next.events)) next.events = [];
    if (!next.modules || typeof next.modules !== 'object' || Array.isArray(next.modules)) next.modules = {};
    return next;
  };

  let initial = null; // { schema, state, panelId } as last sent by the parent
  let activePanel = '';

  const viewportTier = () => {
    if (window.matchMedia('(max-width:820px)').matches) return 'mobile';
    if (window.matchMedia('(max-width:1080px)').matches) return 'compact';
    return 'desktop';
  };

  const report = ok => {
    const schema = UI.schemaFor(window.App.activeCharacter);
    const tier = viewportTier();
    const stage = Stage && schema
      ? Stage.resolve({ gameplay: schema, viewport: tier, width: window.innerWidth })
      : null;
    const layoutExact = Boolean(stage) && stage.presentation !== 'embedded';
    if (fidelityNote) fidelityNote.hidden = layoutExact || !ok;
    document.documentElement.dataset.previewLayoutExact = String(layoutExact);
    Iso.post('rendered', {
      ok: Boolean(ok),
      panelId: activePanel,
      panels: schema ? schema.panels.map(panel => panel.id) : [],
      width: window.innerWidth,
      viewport: tier,
      shell: stage ? stage.shell : '',
      presentation: 'panel',
      resolvedPresentation: stage ? stage.presentation : '',
      previewScope: 'panel',
      fidelity: 'single-panel',
      layoutExact
    });
  };

  const renderTabs = schema => {
    tabs.replaceChildren();
    (schema ? schema.panels : []).forEach(panel => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-tab' + (panel.id === activePanel ? ' active' : '');
      button.dataset.panel = panel.id;
      button.textContent = panel.label;
      button.addEventListener('click', () => { activePanel = panel.id; draw(); });
      tabs.appendChild(button);
    });
  };

  const draw = () => {
    const schema = UI.schemaFor(window.App.activeCharacter);
    if (!schema) {
      tabs.replaceChildren();
      panelHost.textContent = '';
      UI.clearTheme(root);
      report(false);
      return false;
    }
    if (!schema.panels.some(panel => panel.id === activePanel)) activePanel = schema.panels[0] ? schema.panels[0].id : '';
    renderTabs(schema);
    const ok = activePanel ? UI.renderPanel(activePanel) : false;
    report(ok);
    return ok;
  };

  const load = ({ schema, state, panelId }) => {
    initial = { schema: clone(schema), state: baseState(state), panelId: panelId || '' };
    // A new character object each time, so the renderer's per-character schema cache is refreshed.
    window.App.activeCharacter = { id: 'gameplay-ui-preview', gameplay_ui: clone(initial.schema) };
    window.GameState.current = clone(initial.state);
    activePanel = initial.panelId;
    document.getElementById('user-input').value = '';
    return draw();
  };

  window.addEventListener('message', event => {
    const result = Protocol.validateMessage(event, {
      allowed: Protocol.TO_PREVIEW,
      expectedOrigin: location.origin,
      expectedSource: window.parent
    });
    if (!result.ok) return; // silently ignore anything that is not from our parent
    if (window.parent === window) return;
    if (result.type === 'render') load(result.payload);
    else if (result.type === 'set-state') {
      window.GameState.current = baseState(result.payload.state);
      draw();
    } else if (result.type === 'reset' && initial) load(initial);
  });

  // The renderer re-draws after an action; mirror the (preview-only) state back to the parent.
  const originalRender = window.App.renderUIPanel;
  window.App.renderUIPanel = panelId => {
    const ok = originalRender(panelId);
    Iso.post('state', { state: clone(window.GameState.current) });
    return ok;
  };

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (window.App.activeCharacter) report(true); });
  });

  Iso.post('ready', { width: window.innerWidth, viewport: viewportTier() });
})();
