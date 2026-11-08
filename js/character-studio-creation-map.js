/* P3 author navigation across existing character, worldbook, status and UI structures. */
(() => {
  'use strict';
  const core = window.BAOStudioCreationMapCore;
  const studio = window.BAOCharacterStudio;
  const flow = window.BAOCharacterStudioFlow;
  const form = document.getElementById('studio-form');
  const worldPanel = form?.querySelector('[data-studio-flow-panel="world"]');
  if (!core || !studio || !flow || !form || !worldPanel || window.BAOStudioCreationMap) return;

  const map = document.createElement('section');
  map.id = 'studio-creation-map';
  map.className = 'studio-creation-map';
  map.setAttribute('aria-labelledby', 'studio-creation-map-title');
  map.innerHTML = [
    '<header class="studio-creation-map-head"><div><span class="eyebrow">WORK STRUCTURE</span>',
    '<h2 id="studio-creation-map-title">同一張作品，四個層次</h2>',
    '<p>人物回答「誰在這裡」；世界資料回答「世界如何運作、什麼資訊何時載入」；數值記錄會變動的狀態；互動 UI 只決定玩家如何看見與操作。它們共用同一張角色卡，不會互相取代。</p></div></header>',
    '<div class="studio-creation-map-grid">',
    '<article data-creation-area="people"><div class="studio-creation-map-title"><span>01</span><div><small>誰在世界裡</small><h3>人物資料</h3></div></div><strong data-creation-state></strong><p data-creation-detail></p><div class="studio-creation-map-actions"><button type="button" class="secondary" data-creation-go="profile">主要角色</button><button type="button" class="secondary" data-creation-go="npcs">初始 NPC</button></div></article>',
    '<article data-creation-area="world"><div class="studio-creation-map-title"><span>02</span><div><small>世界與知識</small><h3>規則／世界書</h3></div></div><strong data-creation-state></strong><p data-creation-detail></p><div class="studio-creation-map-actions"><button type="button" class="secondary" data-creation-go="world">世界規則</button><button type="button" class="secondary" data-creation-go="lore">按需世界書</button></div></article>',
    '<article data-creation-area="status"><div class="studio-creation-map-title"><span>03</span><div><small>哪些變化要保存</small><h3>人物數值</h3></div></div><strong data-creation-state></strong><p data-creation-detail></p><div class="studio-creation-map-actions"><button type="button" class="secondary" data-creation-go="status">管理數值與初始值</button></div></article>',
    '<article data-creation-area="ui"><div class="studio-creation-map-title"><span>04</span><div><small>玩家如何看見與操作</small><h3>互動呈現</h3></div></div><strong data-creation-state></strong><p data-creation-detail></p><div class="studio-creation-map-actions"><button type="button" class="secondary" data-creation-go="ui">前往互動 UI</button></div></article>',
    '</div>',
    '<p class="note studio-creation-map-note">不知道資料該放哪裡時，先依這四層判斷；完成後可到「預覽與完成」用 BAO Doctor 再核對交叉參照。</p>'
  ].join('');
  const stageHead = worldPanel.querySelector('.studio-stage-head');
  stageHead?.insertAdjacentElement('afterend', map);

  const field = name => form.elements.namedItem(name);
  const snapshot = () => {
    const status = studio.getAuthorStatusData();
    return core.derive({
      name: field('name')?.value,
      worldMode: field('mode')?.value === 'world',
      profile: field('profile')?.value,
      world: field('world')?.value,
      lore: field('lore')?.value,
      npcs: studio.getInitialNPCs(),
      statusFields: status.character_status?.fields,
      statusSubjects: status.initial_state?.character_statuses,
      phoneEnabled: field('phone_ui_enabled')?.checked,
      dialogueEnabled: field('dialogue_mode')?.value === 'avatar_chat',
      gameplayEnabled: Boolean(studio.getGameplayUI())
    });
  };

  function render() {
    const view = snapshot();
    Object.entries(view.areas).forEach(([key, area]) => {
      const card = map.querySelector('[data-creation-area="' + key + '"]');
      if (!card) return;
      card.dataset.state = area.key;
      card.dataset.tone = area.tone;
      card.querySelector('[data-creation-state]').textContent = area.label;
      card.querySelector('[data-creation-detail]').textContent = area.detail;
    });
    return view;
  }

  const focusTarget = (target, selector, detailsSelector) => {
    flow.go(target);
    window.setTimeout(() => {
      const details = detailsSelector ? document.querySelector(detailsSelector) : null;
      if (details instanceof HTMLDetailsElement) details.open = true;
      const control = document.querySelector(selector);
      if (!control) return;
      control.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      try { control.focus({ preventScroll: true }); } catch (_) {}
    }, 0);
  };

  map.addEventListener('click', event => {
    const button = event.target.closest('[data-creation-go]');
    if (!button) return;
    const route = button.dataset.creationGo;
    if (route === 'profile') focusTarget('world', '[name="profile"]', '.studio-advanced:has([name="profile"])');
    if (route === 'npcs') focusTarget('world', '#studio-npc-editor summary', '#studio-npc-editor');
    if (route === 'world') focusTarget('world', '[name="world"]', '.studio-advanced:has([name="world"])');
    if (route === 'lore') focusTarget('world', '[name="lore"]', '.studio-advanced:has([name="lore"])');
    if (route === 'status') focusTarget('world', '#studio-status-templates summary', '#studio-status-templates');
    if (route === 'ui') focusTarget('appearance', '[name="phone_ui_enabled"]');
  });

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => { scheduled = false; render(); }, 40);
  };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  ['bao:character-studio-card-shown', 'bao:studio-npcs-changed', 'bao:studio-status-changed', 'bao:studio-gameplay-changed']
    .forEach(name => window.addEventListener(name, schedule));

  window.BAOStudioCreationMap = Object.freeze({ render, snapshot });
  render();
})();
