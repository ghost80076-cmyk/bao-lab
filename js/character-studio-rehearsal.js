/* Creator rehearsal handoff: reuse preview, BAO Doctor and the local character library. */
(() => {
  'use strict';

  const core = window.BAOStudioRehearsalCore;
  const studio = window.BAOCharacterStudio;
  const engine = window.CharacterEngine;
  const form = document.getElementById('studio-form');
  if (!core || !studio || !engine || !form || window.BAOStudioRehearsal) return;

  const finish = form.querySelector('[data-studio-flow-panel="finish"]') || form;
  const actions = finish.querySelector('.studio-button-row');
  const panel = document.createElement('section');
  panel.id = 'studio-rehearsal';
  panel.className = 'studio-rehearsal';
  panel.setAttribute('aria-labelledby', 'studio-rehearsal-title');
  panel.innerHTML = [
    '<header class="studio-rehearsal-head"><div><span class="eyebrow">REHEARSAL</span>',
    '<h2 id="studio-rehearsal-title">預覽、診斷，再實際試演</h2>',
    '<p>三個入口都沿用夜灣現有資料。前兩步不呼叫 AI；本機試演只會先進入正常故事設定，真正送出訊息時才可能呼叫你選擇的模型。</p></div></header>',
    '<div class="studio-rehearsal-grid">',
    '<article data-rehearsal-card="preview"><span>01</span><div><small>純文字確認</small><h3>開場預覽</h3><b data-rehearsal-state>整理中…</b><p data-rehearsal-detail></p></div><button type="button" class="secondary" data-rehearsal-preview>預覽目前草稿</button></article>',
    '<article data-rehearsal-card="diagnosis"><span>02</span><div><small>靜態結構</small><h3>BAO Doctor</h3><b data-rehearsal-state>整理中…</b><p data-rehearsal-detail></p></div><button type="button" class="secondary" data-rehearsal-doctor>查看診斷</button></article>',
    '<article data-rehearsal-card="rehearsal"><span>03</span><div><small>本機故事流程</small><h3>角色試演</h3><b data-rehearsal-state>整理中…</b><p data-rehearsal-detail></p></div><button type="button" class="primary" data-rehearsal-start>儲存並前往試演</button></article>',
    '</div>',
    '<p class="note studio-rehearsal-status" role="status" aria-live="polite" data-rehearsal-status>試演不會公開作品，也不會修改既有故事存檔。</p>'
  ].join('');
  finish.insertBefore(panel, actions || null);

  const status = panel.querySelector('[data-rehearsal-status]');
  let refreshVersion = 0;
  let scheduled = false;

  const writeCard = (kind, value) => {
    const card = panel.querySelector('[data-rehearsal-card="' + kind + '"]');
    if (!card || !value) return;
    card.dataset.tone = value.tone;
    card.dataset.state = value.key;
    const label = card.querySelector('[data-rehearsal-state]');
    const detail = card.querySelector('[data-rehearsal-detail]');
    if (label) label.textContent = value.label;
    if (detail) detail.textContent = value.detail;
  };

  async function snapshot() {
    await engine.readyCustomLibrary?.();
    const card = studio.readCard();
    const current = studio.toExport(card);
    const installed = engine.loadCustom().find(item => String(item?.id || '') === String(card.id || '')) || null;
    let synced = false;
    if (installed) {
      try {
        const installedExport = studio.toExport(installed);
        synced = window.BAOCharacterStudioLifecycleCore?.sameVersion
          ? window.BAOCharacterStudioLifecycleCore.sameVersion(current, installedExport)
          : JSON.stringify(current) === JSON.stringify(installedExport);
      } catch (_) {}
    }
    const report = window.BAODoctor?.analyze?.(card) || { findings: [] };
    return {
      card,
      installed: Boolean(installed),
      synced,
      state: studio.getState?.() || { dirty: true },
      report,
      view: core.derive({ installed: Boolean(installed), synced, dirty: studio.getState?.().dirty, report })
    };
  }

  async function refresh() {
    scheduled = false;
    const version = ++refreshVersion;
    try {
      const data = await snapshot();
      if (version !== refreshVersion || !panel.isConnected) return data;
      writeCard('preview', data.view.preview);
      writeCard('diagnosis', data.view.diagnosis);
      writeCard('rehearsal', data.view.rehearsal);
      const start = panel.querySelector('[data-rehearsal-start]');
      if (start) {
        start.textContent = data.view.blockers ? '先查看並修正診斷'
          : data.installed && data.synced && !data.state.dirty ? '前往本機試演' : '儲存並前往試演';
      }
      return data;
    } catch (error) {
      if (version === refreshVersion) {
        writeCard('diagnosis', { key: 'blocked', tone: 'bad', label: '目前草稿尚未可檢查', detail: error?.message || '請先完成未提交的編輯。' });
        writeCard('rehearsal', { key: 'blocked', tone: 'bad', label: '尚未可試演', detail: '請先完成必要欄位與未儲存的子編輯。' });
      }
      return null;
    }
  }

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(refresh, 70);
  };

  panel.querySelector('[data-rehearsal-preview]').addEventListener('click', () => {
    document.getElementById('studio-preview-button')?.click();
  });
  panel.querySelector('[data-rehearsal-doctor]').addEventListener('click', () => {
    document.getElementById('studio-doctor')?.click();
  });
  panel.querySelector('[data-rehearsal-start]').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const current = await snapshot();
      if (current.view.blockers) {
        status.textContent = '目前有阻擋性結構問題；已開啟 BAO Doctor，修正後再試演。';
        document.getElementById('studio-doctor')?.click();
        return;
      }
      status.textContent = '正在儲存草稿並同步本機試玩版本…';
      const saved = await studio.installLocal?.();
      if (!saved) {
        status.textContent = '已取消本機版本更新，仍留在創作室。';
        return;
      }
      status.textContent = '本機版本已驗證，正在開啟角色試演…';
      window.location.assign(core.destination(saved.id));
    } catch (error) {
      status.textContent = '無法開始試演：' + (error?.message || '操作失敗');
    } finally {
      button.disabled = false;
      schedule();
    }
  });

  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  ['bao:character-studio-card-shown', 'bao:studio-npcs-changed', 'bao:studio-status-changed']
    .forEach(name => window.addEventListener(name, schedule));
  const studioStatus = document.getElementById('studio-status');
  if (studioStatus) new MutationObserver(schedule).observe(studioStatus, { childList: true, subtree: true, characterData: true });

  window.BAOStudioRehearsal = Object.freeze({ refresh, snapshot });
  schedule();
})();
