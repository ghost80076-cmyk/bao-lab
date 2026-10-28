/* YoruBay Stage Capability adapter.
 * Reads existing safe platform state and exposes one canonical Stage contract.
 * No author code execution, no API-key access, no storage writes.
 */
(() => {
  'use strict';
  const Core = window.BAOStageCapabilityCore;
  if (!Core || window.BAOStageCapabilities) return;

  const viewport = value => {
    if (value === 'mobile' || value === 'compact' || value === 'desktop') return value;
    if (window.matchMedia?.('(max-width:820px)').matches) return 'mobile';
    if (window.matchMedia?.('(max-width:1080px)').matches) return 'compact';
    return 'desktop';
  };

  const gameplayFor = character => {
    try {
      return window.BAOGameplayUI?.schemaFor?.(character)
        || window.BAOGameplayUICore?.normalize?.(character?.gameplay_ui || character?.gameplay?.ui_schema)
        || null;
    } catch {
      return null;
    }
  };

  const phoneFor = (character, state) => {
    try {
      return window.BAOPhonePlayerCore?.resolve?.(character?.phone_ui, state)
        || window.BAOPhoneUICore?.normalize?.(character?.phone_ui)
        || null;
    } catch {
      return null;
    }
  };

  const resolve = (options = {}) => {
    const character = options.character || window.App?.activeCharacter || null;
    const state = options.state || window.GameState?.current || null;
    return Core.resolve({
      gameplay: gameplayFor(character),
      phone: Boolean(phoneFor(character, state)),
      preferred: character?.play_info_surface,
      viewport: viewport(options.viewport),
      width: options.width ?? window.innerWidth
    });
  };

  const sync = (root = document.getElementById('chat-view'), options = {}) => {
    const capability = resolve(options);
    if (root) {
      root.dataset.baoStageShell = capability.shell;
      root.dataset.baoStageRenderer = capability.renderer;
      root.dataset.baoStagePresentation = capability.presentation;
    }
    return capability;
  };

  const openPrimary = (options = {}) => {
    const capability = resolve(options);
    if (capability.renderer === 'phone') {
      if (!window.BAOPhoneUI?.open) return false;
      window.BAOPhoneUI.open();
      return true;
    }
    if (capability.renderer === 'reader-context') {
      return Boolean(window.BAOReaderContext?.open?.(options.readerContext || options));
    }
    return false;
  };

  const closePrimary = (options = {}) => {
    const capability = resolve(options);
    if (capability.renderer === 'phone') {
      window.BAOPhoneUI?.close?.();
      return true;
    }
    if (capability.renderer === 'reader-context') {
      window.BAOReaderContext?.close?.(options.readerContext || options);
      return true;
    }
    return false;
  };

  window.BAOStageCapabilities = Object.freeze({
    version: 1,
    resolve,
    sync,
    openPrimary,
    closePrimary
  });
})();