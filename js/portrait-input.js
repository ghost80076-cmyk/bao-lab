/* Bounded portable thumbnails, stored once per person in existing local records. */
(() => {
  'use strict';
  const Core = window.BAOAvatarChatCore;
  if (!Core || window.BAOPortraitInput) return;
  function field(value = '', id = '', fieldName = 'avatar') {
    const src = Core.image(value);
    return `<div class="portrait-input" data-portrait-field><label>角色頭像<input type="hidden" name="${Core.esc(fieldName)}" ${id ? `id="${Core.esc(id)}"` : ''} value="${Core.esc(src)}"><input type="file" data-portrait-upload accept="image/png,image/jpeg,image/webp" aria-label="選擇角色頭像"></label><img data-portrait-preview alt="頭像預覽" ${src && !src.startsWith('yorubay-asset:') ? `src="${Core.esc(src)}"` : 'hidden'}><button type="button" data-portrait-remove>移除頭像</button><small data-portrait-status>圖片會縮成頭像，保存在這台裝置並隨 JSON 備份。</small></div>`;
  }
  async function encode(file) {
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('請選擇 10 MB 以內的 PNG、JPEG 或 WebP 圖片。');
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const size = Math.min(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 256, 256);
      for (const quality of [0.85, 0.65, 0.45]) {
        const data = canvas.toDataURL('image/webp', quality);
        if (Core.image(data)) return data;
      }
      throw new Error('縮圖仍然過大，請改用較簡單的圖片。');
    } finally { bitmap.close(); }
  }
  function sync(root = document) {
    root.querySelectorAll('[data-portrait-field]').forEach(box => {
      const value = Core.image(box.querySelector('input[type="hidden"]').value), img = box.querySelector('[data-portrait-preview]');
      const src = value.startsWith('yorubay-asset:') ? '' : value;
      if (src) img.setAttribute('src', src); else img.removeAttribute('src');
      img.hidden = !src;
    });
  }
  document.addEventListener('change', async event => {
    const upload = event.target.closest?.('[data-portrait-upload]');
    if (!upload?.files?.[0]) return;
    const box = upload.closest('[data-portrait-field]'), input = box.querySelector('input[type="hidden"]');
    const before = input.value, file = upload.files[0], ticket = Symbol();
    box._portraitJob = ticket;
    upload.disabled = true;
    try {
      const data = await encode(file);
      if (!box.isConnected || box._portraitJob !== ticket || input.value !== before) return;
      input.value = data; sync(box.parentElement);
      input.dispatchEvent(new Event('input', {bubbles:true}));
      box.querySelector('[data-portrait-status]').textContent = '頭像已準備好，儲存人物後生效。';
    } catch (error) { box.querySelector('[data-portrait-status]').textContent = error.message; }
    finally { upload.disabled = false; upload.value = ''; }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-portrait-remove]');
    if (!button) return;
    const box = button.closest('[data-portrait-field]'); box._portraitJob = null;
    const input = box.querySelector('input[type="hidden"]'); input.value = ''; sync(box.parentElement);
    input.dispatchEvent(new Event('input', {bubbles:true}));
  });
  // Failed remote or removed images keep the readable initial underneath.
  document.addEventListener('error', event => {
    if (event.target.matches?.('.avatar-chat-portrait img')) event.target.hidden = true;
  }, true);
  window.BAOPortraitInput = {field, encode, sync};
})();
