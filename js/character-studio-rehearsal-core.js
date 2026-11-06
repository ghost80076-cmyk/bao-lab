/* Pure creator rehearsal state. No storage, navigation or model calls. */
(function (root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOStudioRehearsalCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const clean = value => String(value ?? '').trim();

  function destination(characterId) {
    const id = clean(characterId);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) {
      throw new Error('請先填寫合法的角色 ID，再開始本機試演。');
    }
    return 'index.html?work=' + encodeURIComponent(id) + '&rehearsal=1';
  }

  function derive(input = {}) {
    const report = input.report && typeof input.report === 'object' ? input.report : {};
    const findings = Array.isArray(report.findings) ? report.findings : [];
    const blockers = findings.filter(item => item?.severity === 'blocker').length;
    const warnings = findings.filter(item => item?.severity === 'warning').length;
    const installed = input.installed === true;
    const synced = input.synced === true;
    const dirty = input.dirty !== false;

    const preview = {
      key: 'preview', tone: 'good', label: '可隨時預覽',
      detail: '只顯示封面、簡介、開場與核心設定，不呼叫 AI。'
    };
    const diagnosis = blockers
      ? { key: 'blocked', tone: 'bad', label: blockers + ' 個阻擋問題', detail: '先開啟 BAO Doctor 查看證據與修正位置。' }
      : warnings
        ? { key: 'attention', tone: 'warn', label: warnings + ' 個注意項目', detail: '可以試演；只處理有實際影響的提醒，不必追求滿分。' }
        : { key: 'clear', tone: 'good', label: '靜態檢查無阻擋', detail: 'Runtime、記憶與模型表現仍需實際試演。' };

    let rehearsal;
    if (blockers) {
      rehearsal = { key: 'blocked', tone: 'bad', label: '修正後再試演', detail: '角色卡結構尚未能安全加入本機角色庫。' };
    } else if (dirty) {
      rehearsal = { key: 'dirty', tone: 'warn', label: '會先儲存並同步', detail: '開始前會把目前草稿寫入本機角色庫。' };
    } else if (!installed) {
      rehearsal = { key: 'not-installed', tone: 'muted', label: '尚無本機試玩版本', detail: '開始時會建立本機版本，不會公開作品。' };
    } else if (!synced) {
      rehearsal = { key: 'outdated', tone: 'warn', label: '本機版本待更新', detail: '開始時會先同步目前草稿。' };
    } else {
      rehearsal = { key: 'ready', tone: 'good', label: '可開始本機試演', detail: '會精準開啟這張作品的正常故事設定頁。' };
    }
    return { preview, diagnosis, rehearsal, blockers, warnings };
  }

  return { destination, derive };
});
