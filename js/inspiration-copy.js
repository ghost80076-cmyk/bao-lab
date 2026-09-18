/* Clipboard compatibility for the action-inspiration option chips.
 * Presentation only: no API requests, prompt changes or story writes.
 */
(() => {
  'use strict';
  if (window.BAOInspirationCopy) return;

  const legacyCopy = text => {
    const previousFocus = document.activeElement;
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.setAttribute('aria-hidden', 'true');
    // Mobile browsers may refuse execCommand on display:none or off-screen fields.
    field.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;z-index:-1;';
    document.body.appendChild(field);
    let copied = false;
    try {
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, text.length);
      copied = Boolean(document.execCommand?.('copy'));
    } catch (_) {
      copied = false;
    } finally {
      field.remove();
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        try { previousFocus.focus({ preventScroll: true }); } catch (_) {}
      }
    }
    return copied;
  };

  const copyText = async text => {
    // Do the legacy attempt inside the original click gesture. If the async API
    // rejects first, mobile browsers may revoke that gesture before fallback.
    if (legacyCopy(text)) return true;
    try {
      if (typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    return false;
  };

  const removeManual = row => {
    const next = row.nextElementSibling;
    if (next?.classList.contains('story-copy-manual')) next.remove();
  };

  const showManual = (row, text) => {
    removeManual(row);
    const help = document.createElement('div');
    help.className = 'story-copy-manual';
    help.style.cssText = 'display:grid;gap:6px;min-width:0;';
    const note = document.createElement('small');
    note.setAttribute('role', 'status');
    note.textContent = '瀏覽器未允許自動複製，請長按下方文字選擇「複製」。';
    const field = document.createElement('textarea');
    field.readOnly = true;
    field.value = text;
    field.setAttribute('aria-label', '可手動複製的行動靈感');
    field.style.cssText = 'box-sizing:border-box;width:100%;min-height:92px;padding:10px;border-radius:8px;resize:vertical;user-select:text;-webkit-user-select:text;';
    help.append(note, field);
    row.insertAdjacentElement('afterend', help);
    try {
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, text.length);
    } catch (_) {}
  };

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('button.story-copy-chip');
    const row = button?.closest('.story-inspiration-row');
    const panel = row?.closest('.story-inspiration-panel');
    if (!panel || !row || row.querySelector(':scope > button.story-copy-chip') !== button) return;
    // Stop the old button handler: it shows ✓ even when writing failed.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.disabled) return;
    const option = row.querySelector('.story-inspiration-chip');
    const rows = [...panel.querySelectorAll('.story-inspiration-row')];
    const position = rows.indexOf(row);
    if (!option || position < 0) return;
    const label = option.textContent || '';
    const prefix = `${position + 1}. `;
    const text = label.startsWith(prefix) ? label.slice(prefix.length) : label;
    if (!text.trim()) return;

    button.disabled = true;
    const success = await copyText(text);
    if (!button.isConnected) return;
    button.disabled = false;
    if (success) {
      removeManual(row);
      button.textContent = '✓';
      button.title = '已複製';
      button.setAttribute('aria-label', '已複製行動靈感');
    } else {
      showManual(row, text);
      button.textContent = '!';
      button.title = '瀏覽器禁止自動複製，請手動選取';
      button.setAttribute('aria-label', '複製失敗，請手動選取');
    }
    setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = '⧉';
      button.title = '複製';
      button.setAttribute('aria-label', '複製行動靈感');
    }, 1100);
  }, true);

  window.BAOInspirationCopy = { copyText };
})();
