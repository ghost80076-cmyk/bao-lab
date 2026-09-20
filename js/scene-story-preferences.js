/* Scene presentation belongs to the story, never to a second world-state store. */
(() => {
  'use strict';
  if (window.BAOSceneStoryPreferences || !window.BAOSceneHTML || !window.Storage || !window.GameState || !window.App) return;

  const KEY = 'bao-lab:scene-html-preferences';
  const MODES = new Set(['native', 'efficient', 'free']);
  const STATUSES = new Set(['native', 'author', 'hidden']);
  const scene = window.BAOSceneHTML;
  const normalize = (value, fallback = { mode: 'efficient', status: 'native' }) => ({
    mode: MODES.has(value?.mode) ? value.mode : fallback.mode,
    status: STATUSES.has(value?.status) ? value.status : fallback.status
  });
  const defaults = () => {
    try { return normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch { return normalize(null); }
  };
  const current = () => normalize(scene.prefs);
  const ensureConfig = config => {
    if (!config || typeof config !== 'object') return null;
    // For a new story use the last explicitly selected browser defaults. Never
    // inherit a different story merely because it was restored moments ago.
    config.scenePresentation = normalize(config.scenePresentation, defaults());
    return config.scenePresentation;
  };
  const apply = value => {
    const selected = normalize(value, defaults());
    scene.prefs.mode = selected.mode;
    scene.prefs.status = selected.status;
    const controls = document.querySelectorAll?.('#bao-scene-controls select') || [];
    if (controls[0]) controls[0].value = selected.mode;
    if (controls[1]) controls[1].value = selected.status;
    scene.refresh?.();
    return selected;
  };

  const originalCreate = GameState.create.bind(GameState);
  GameState.create = function(character, config, ...rest) {
    const selected = ensureConfig(config);
    if (selected) apply(selected);
    return originalCreate(character, config, ...rest);
  };

  const originalBuild = Storage.buildStoryPayload.bind(Storage);
  Storage.buildStoryPayload = function(...args) {
    if (GameState.current && App.config) {
      ensureConfig(App.config);
      if (GameState.current.config) GameState.current.config = App.config;
    }
    return originalBuild(...args);
  };

  const originalRestore = Storage.restoreStory.bind(Storage);
  Storage.restoreStory = function(save, ...rest) {
    const restored = originalRestore(save, ...rest);
    if (!restored) return restored;
    // Old backups did not carry scenePresentation: keep their former browser
    // defaults on first restore, then persist that choice with the story.
    apply(ensureConfig(App.config));
    if (GameState.current) GameState.current.config = App.config;
    return restored;
  };

  // Existing controls write a browser-wide default. Also write the active
  // story config and autosave it; restoring another story does NOT overwrite
  // those defaults, so new stories never inherit the last restored story.
  document.addEventListener?.('change', event => {
    const panel = event.target?.closest?.('#bao-scene-controls');
    if (!panel || !GameState.current || !App.config) return;
    const controls = panel.querySelectorAll?.('select') || [];
    if (event.target !== controls[0] && event.target !== controls[1]) return;
    App.config.scenePresentation = current();
    GameState.current.config = App.config;
    App.saveStory?.(false);
  });

  // Resume paths render after restore, but other story entry points may call
  // the shell directly. Keep their prompt, controls and display in agreement.
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    if (GameState.current && App.config?.scenePresentation) apply(App.config.scenePresentation);
    return originalShell(...args);
  };

  window.BAOSceneStoryPreferences = { normalize, defaults, current, apply, ensureConfig };
})();
