/* Story image prompts: local author metadata, optional player-owned text API. No image API or platform credits. */
(() => {
  if (typeof App === 'undefined' || typeof Chat === 'undefined') return;
  const profileOf = card => card?.image_prompt_profile || card?.presentation?.image_prompt_profile || '';
  const plain = value => typeof value === 'string' ? value.slice(0, 6000) : '';
  const dialog = (title, description) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10020;background:#000c;display:grid;place-items:center;padding:12px';
    const panel = document.createElement('section');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title);
    panel.style.cssText = 'width:min(680px,100%);max-height:90dvh;overflow:auto;background:var(--panel,#222);color:var(--text,#eee);border-radius:14px;padding:18px;display:grid;gap:12px;box-sizing:border-box';
    const heading = document.createElement('h2'); heading.textContent = title;
    const help = document.createElement('p'); help.textContent = description;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '關閉'; close.addEventListener('click', () => overlay.remove());
    panel.append(heading, help); overlay.append(panel); document.body.append(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    return { overlay, panel, status, close };
  };
  const button = (label, action) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.addEventListener('click', action); return el; };
  const textarea = (label, value, rows = 8) => {
    const wrap = document.createElement('label'); wrap.style.cssText = 'display:grid;gap:6px';
    const caption = document.createElement('span'); caption.textContent = label;
    const field = document.createElement('textarea'); field.rows = rows; field.value = value; field.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical';
    wrap.append(caption, field); return { wrap, field };
  };
  const copy = async (value, status) => {
    try { await navigator.clipboard.writeText(value); status.textContent = '已複製提示詞。'; }
    catch { status.textContent = '瀏覽器無法自動複製，請選取文字後手動複製。'; }
  };
  const openPlayer = () => {
    const card = App.activeCharacter;
    if (!card) return;
    const { panel, status, close } = dialog('劇情配圖提示詞', '複製作者設定不需要 API；AI 分析只使用你目前連接的文字模型 API，可能產生服務商費用。BAO/LAB 不提供模型額度或生圖 API。');
    const profile = textarea('作者視覺設定（可自行修改，不會改動角色卡）', plain(profileOf(card)), 5);
    const result = textarea('圖片提示詞（生成後可編輯、複製到自己的生圖網站）', '', 9);
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const copyAuthor = button('複製作者設定', () => copy(profile.field.value, status));
    const copyResult = button('複製圖片提示詞', () => copy(result.field.value, status));
    const generate = button('用我的文字模型分析當前劇情', async () => {
      const config = App.config?.api;
      if (!config?.key || !config?.model || !config?.baseUrl) { status.textContent = '請先連接自己的文字模型 API；BAO/LAB 不提供免費 API。'; return; }
      if (!Chat.messages?.length) { status.textContent = '目前尚無對話；可先複製作者設定。'; return; }
      generate.disabled = true; status.textContent = '正在使用你的文字模型製作提示詞……';
      try {
        const history = Chat.messages.slice(-8).map(m => `${m.role === 'user' ? '玩家' : '敘事'}：${plain(m.content).slice(0, 1400)}`).join('\n').slice(0, 9000);
        const messages = [
          { role: 'system', content: '你是圖片提示詞編輯。只根據已提供的劇情和角色視覺設定，產生一段可直接複製的圖片生成提示詞。保留角色固定外觀；只描繪當前已知場景，不創造新人物、受傷、武器或劇情事實。不要輸出 HTML、JSON 或說明。' },
          { role: 'user', content: `角色：${plain(card.name)}\n作者視覺設定：\n${plain(profile.field.value) || '未提供'}\n\n最近劇情（僅供畫面參考）：\n${history}\n\n請產生目前場景的圖片提示詞。` }
        ];
        const apiConfig = typeof App.applyProviderContext === 'function' ? App.applyProviderContext(config) : config;
        const response = await API.send(apiConfig, messages);
        result.field.value = plain(response?.text);
        status.textContent = result.field.value ? '已產生提示詞。請確認內容後再複製；沒有自動生圖，也不會寫入故事。' : '模型沒有回傳提示詞。';
      } catch (error) { status.textContent = `提示詞產生失敗：${error?.message || '未知錯誤'}`; }
      finally { generate.disabled = false; }
    });
    actions.append(copyAuthor, generate, copyResult);
    panel.append(profile.wrap, result.wrap, actions, status, close);
  };
  const openAuthor = () => {
    const { panel, status, close } = dialog('作者圖片提示詞設定', '匯入 BAO/LAB 角色 JSON，填寫視覺設定並下載修改後的角色卡。此操作完全在本機進行，不呼叫 API。');
    const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,application/json'; file.setAttribute('aria-label', '匯入角色 JSON');
    const editor = textarea('角色固定外觀、畫風與世界視覺設定', '', 10);
    let card = null;
    file.addEventListener('change', async () => {
      try {
        const selected = file.files?.[0]; if (!selected) return;
        if (selected.size > 1024 * 1024) throw new Error('角色 JSON 不可超過 1 MB。');
        const value = JSON.parse(await selected.text());
        if (!value || Array.isArray(value) || typeof value !== 'object' || !(value.id || value.meta?.id)) throw new Error('請匯入包含角色 ID 的角色 JSON。');
        card = value; editor.field.value = plain(profileOf(card)); status.textContent = '已讀取角色卡。';
      } catch (error) { card = null; status.textContent = error.message || '角色 JSON 無法讀取。'; }
    });
    const download = button('下載修改後的角色 JSON', () => {
      if (!card) { status.textContent = '請先匯入角色 JSON。'; return; }
      const updated = JSON.parse(JSON.stringify(card));
      updated.image_prompt_profile = plain(editor.field.value);
      if (updated.presentation && typeof updated.presentation === 'object') delete updated.presentation.image_prompt_profile;
      const url = URL.createObjectURL(new Blob([JSON.stringify(updated, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${String(updated.id || updated.meta.id).replace(/[^a-zA-Z0-9_-]/g, '') || 'character'}-visual.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = '已下載角色 JSON；請將檔案匯入角色庫以使用新設定。';
    });
    panel.append(file, editor.wrap, download, status, close);
  };
  const mount = () => {
    const chat = document.getElementById('chat-view');
    if (chat && !chat.querySelector('[data-bao-image-prompt]')) {
      const target = chat.querySelector('.chat-tools, .chat-actions, .chat-header, .chat-sidebar, aside') || chat;
      const trigger = button('劇情配圖提示詞', openPlayer); trigger.dataset.baoImagePrompt = '1';
      target.append(trigger);
    }
    const tools = document.querySelector('.character-tools');
    if (tools && !tools.querySelector('[data-bao-author-image-prompt]')) {
      const trigger = button('作者圖片提示詞設定', openAuthor); trigger.dataset.baoAuthorImagePrompt = '1'; tools.append(trigger);
    }
  };
  mount();
  let attempts = 0;
  const timer = setInterval(() => { mount(); if (++attempts >= 60) clearInterval(timer); }, 250);
  window.BAOStoryImagePrompts = { openPlayer, openAuthor, mount, profileOf };
})();