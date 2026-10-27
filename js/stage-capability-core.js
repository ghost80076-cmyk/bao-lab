/* YoruBay Stage Capability core.
 * Pure resolver only: no DOM, storage, network, model calls or story mutations.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOStageCapabilityCore = api;
})(typeof self !== 'undefined' ? self : null, function() {
  'use strict';

  const SHELLS = Object.freeze(['reader', 'gameplay', 'rpg-dashboard', 'scene-rpg', 'terminal', 'phone']);
  const RENDERERS = Object.freeze(['reader-context', 'game-ui', 'phone']);
  const PRESENTATIONS = Object.freeze(['sheet', 'panel', 'embedded', 'overlay']);
  const GAMEPLAY_LAYOUTS = new Set(['standard', 'rpg-dashboard', 'scene-rpg', 'terminal']);

  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const text = value => String(value ?? '').trim();

  function gameplayFacts(gameplay, preferred) {
    const schema = object(gameplay) ? gameplay : null;
    const presetRaw = text(schema?.layout?.preset);
    const preset = GAMEPLAY_LAYOUTS.has(presetRaw) ? presetRaw : 'standard';
    const panels = Array.isArray(schema?.panels) ? schema.panels : [];
    const legacyGameUI = preferred === 'game-ui';
    const available = legacyGameUI || panels.length > 0;
    const shell = ['rpg-dashboard', 'scene-rpg', 'terminal'].includes(preset)
      ? preset
      : 'gameplay';
    const anchor = panels.some(panel => panel.id === schema?.layout?.left_panel) ? 'bao-gameplay-dashboard-left'
      : panels.some(panel => panel.id === schema?.layout?.right_panel) ? 'bao-gameplay-dashboard-right' : '';
    return { available, shell, preset, legacyGameUI, anchor };
  }

  function rendererFor(shell, viewport) {
    if (shell === 'phone') return 'phone';
    if (shell === 'reader') return viewport === 'desktop' ? 'reader-context' : 'game-ui';
    return 'game-ui';
  }

  function presentationFor(shell, viewport, width, gameplay) {
    if (shell === 'phone') return 'overlay';
    if (shell === 'terminal') return viewport === 'desktop' && width >= 1081 ? 'embedded' : 'panel';
    if (shell === 'rpg-dashboard') return viewport === 'desktop' && width >= 1430 && gameplay.anchor ? 'embedded' : 'panel';
    if (shell === 'scene-rpg') return viewport === 'desktop' && width >= 1280 ? 'embedded' : 'panel';
    if (shell === 'reader') return viewport === 'desktop' ? 'sheet' : 'panel';
    return 'panel';
  }

  function labelFor(shell) {
    if (shell === 'phone') return '作品手機';
    if (shell === 'rpg-dashboard') return 'RPG 舞臺';
    if (shell === 'scene-rpg') return '場景舞臺';
    if (shell === 'terminal') return '終端舞臺';
    if (shell === 'gameplay') return '人物、事件與作品資訊';
    return '故事資訊';
  }

  function controlsFor(renderer, shell, presentation, gameplay) {
    if (presentation === 'embedded') {
      if (shell === 'terminal') return 'bao-gameplay-terminal-stage';
      if (shell === 'scene-rpg') return 'bao-gameplay-scene-stage';
      if (shell === 'rpg-dashboard') return gameplay.anchor;
    }
    if (renderer === 'phone') return 'bao-phone-stage';
    if (renderer === 'reader-context') return 'bao-reader-context';
    return 'game-ui';
  }

  function resolve(input = {}) {
    const preferred = text(input.preferred);
    const viewport = input.viewport === 'mobile' ? 'mobile' : input.viewport === 'compact' ? 'compact' : 'desktop';
    const width = Number.isFinite(Number(input.width)) && Number(input.width) > 0 ? Number(input.width) : Infinity;
    const phoneAvailable = input.phone === true;
    const gameplay = gameplayFacts(input.gameplay, preferred);

    const available = ['reader'];
    if (gameplay.available) available.push(gameplay.shell);
    if (phoneAvailable) available.push('phone');

    let shell = gameplay.available ? gameplay.shell : 'reader';
    let source = gameplay.available ? 'gameplay-ui' : 'default';

    // Only existing/explicit platform intent may override the default.
    // An authored phone_ui alone remains an optional launcher for compatibility.
    if (preferred === 'phone' && phoneAvailable) {
      shell = 'phone';
      source = 'explicit';
    } else if (preferred === 'game-ui') {
      shell = gameplay.shell;
      source = 'explicit';
    }

    const renderer = rendererFor(shell, viewport);
    const presentation = presentationFor(shell, viewport, width, gameplay);
    const label = labelFor(shell);

    return Object.freeze({
      version: 1,
      shell,
      renderer,
      presentation,
      viewport,
      source,
      label,
      ariaLabel: '查看舞臺：' + label,
      controls: controlsFor(renderer, shell, presentation, gameplay),
      available: Object.freeze([...new Set(available)]),
      phoneAvailable,
      gameplayAvailable: gameplay.available,
      gameplayPreset: gameplay.preset,
      persistent: presentation === 'embedded'
    });
  }

  return Object.freeze({
    version: 1,
    shells: SHELLS,
    renderers: RENDERERS,
    presentations: PRESENTATIONS,
    resolve
  });
});