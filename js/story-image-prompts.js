/* Story Scene Prompt: portable per-scene image/video prompts using the current text-model route. No image/video provider is called here. */
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
    const urls = new Set();
    const previousFocus = document.activeElement;
    const cleanup = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
    const dismiss = () => {
      if (!overlay.isConnected) return;
      cleanup(); overlay.remove(); previousFocus?.isConnected && previousFocus.focus?.();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = event => { if (event.key === 'Escape') dismiss(); };
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '關閉'; close.addEventListener('click', dismiss);
    panel.append(heading, help); overlay.append(panel); document.body.append(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
    document.addEventListener('keydown', onKey);
    return { overlay, panel, status, close, urls, dismiss, cleanup };
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
  const selectField = (label, options) => {
    const wrap = document.createElement('label'); wrap.style.cssText = 'display:grid;gap:6px;min-width:150px;flex:1';
    const caption = document.createElement('span'); caption.textContent = label;
    const field = document.createElement('select');
    field.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;background:var(--panel,#222);color:inherit;border:1px solid #647082;border-radius:9px';
    for (const [value, text] of options) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; field.append(option);
    }
    wrap.append(caption, field); return { wrap, field };
  };
  const sceneAt = index => {
    const list = Chat.messages || [];
    const fallback = list.findLastIndex(message => message.role === 'assistant');
    const position = Number.isInteger(index) && list[index]?.role === 'assistant' ? index : fallback;
    const selected = position >= 0 ? list[position] : null;
    const context = selected ? list.slice(Math.max(0, position - 7), position + 1)
      .map(message => `${message.role === 'user' ? '玩家' : '敘事'}：${plain(message.content).slice(0, 1400)}`).join('\n').slice(0, 9000) : '';
    return { index: position, id: String(selected?.id || ''), context };
  };
  const extractJson = raw => {
    const text = plain(raw).trim();
    if (!text) return null;
    const candidates = [
      text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
      text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(candidate);
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      } catch {}
    }
    return null;
  };
  const normalizeResult = raw => {
    const parsed = extractJson(raw);
    if (!parsed) return { understanding:'', image_prompt:plain(raw), video_prompt:'', negative_prompt:'', continuity_prompt:'' };
    return {
      understanding: plain(parsed.understanding),
      image_prompt: plain(parsed.image_prompt),
      video_prompt: plain(parsed.video_prompt),
      negative_prompt: plain(parsed.negative_prompt),
      continuity_prompt: plain(parsed.continuity_prompt)
    };
  };
  const currentTextConfig = () => {
    const source = App.config?.api;
    if (!source) return null;
    window.BAOCreditsPilot?.prepareAccountConfig?.(source);
    const hostedReady = Boolean(window.BAOCreditsPilot?.isAccountReady?.(source));
    if (!source.model || !source.baseUrl || (!source.key && !hostedReady)) return null;
    const requested = Number(source.maxOutputTokens || 2200);
    const config = { ...source, __storyTool:true, maxOutputTokens:Number.isFinite(requested) ? Math.min(requested, 2200) : 2200 };
    return typeof App.applyProviderContext === 'function' ? App.applyProviderContext(config) : config;
  };
  const buildVisualMessages = ({ card, profile, scene, mode, style, composition, instruction }) => [
    { role:'system', content:[
      '你是夜灣的 Visual Director／畫面提示詞編輯器。',
      '把指定故事場景翻譯成可攜式圖片／影片提示詞，不續寫故事，也不改寫 canonical story state。',
      '優先順序：玩家本次畫面要求 > 指定場景可觀察事實 > 角色固定外觀與 continuity > 作品視覺設定 > 中性預設。',
      '不得創造未出現的人物、傷勢、武器、服裝變化、關係或劇情事實。',
      '鏡頭要求要轉成生成模型較能理解的 viewpoint、shot、angle、lens、perspective、framing 等攝影語言。',
      '提示詞保持 provider-neutral，不假設玩家使用哪個生圖或生影片網站。',
      '只輸出 JSON，不要 Markdown 或額外說明。',
      'JSON 必須有 understanding、image_prompt、video_prompt、negative_prompt、continuity_prompt 五個字串欄位。'
    ].join('\n') },
    { role:'user', content:[
      `角色／作品：${plain(card.name)}`,
      `輸出模式：${mode}`,
      `視覺風格：${style}`,
      `構圖／鏡位：${composition}`,
      `玩家補充要求：${plain(instruction) || '無'}`,
      '',
      '角色固定外觀、畫風與世界視覺設定：',
      plain(profile) || '未提供',
      '',
      '截至指定回覆的故事場景：',
      scene.context || '目前沒有可分析的 AI 劇情。',
      '',
      '只整理指定回覆當下的畫面。understanding 用中文簡述你理解的場景；若模式不需要圖片或影片，對應欄位輸出空字串。'
    ].join('\n') }
  ];
  const bundle = output => [
    output.understanding && `AI 理解的畫面\n${output.understanding}`,
    output.image_prompt && `圖片 Prompt\n${output.image_prompt}`,
    output.video_prompt && `影片 Prompt\n${output.video_prompt}`,
    output.negative_prompt && `Negative Prompt\n${output.negative_prompt}`,
    output.continuity_prompt && `角色一致性\n${output.continuity_prompt}`
  ].filter(Boolean).join('\n\n');
  const album = {
    ready:null,
    open() {
      if (this.ready) return this.ready;
      this.ready = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('瀏覽器未提供圖片資料庫。'));
        const request = indexedDB.open('bao-lab-scene-images', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          const store = db.createObjectStore('images', { keyPath:'id' });
          store.createIndex('storyId', 'storyId', { unique:false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('無法開啟圖片資料庫。'));
      }).catch(error => { this.ready = null; throw error; });
      return this.ready;
    },
    async query(mode, callback) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', mode);
        let value;
        try { value = callback(tx.objectStore('images')); }
        catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(value?.result);
        tx.onerror = () => reject(tx.error || new Error('圖片資料庫操作失敗。'));
        tx.onabort = () => reject(tx.error || new Error('圖片資料庫寫入中止。'));
      });
    },
    list: storyId => album.query('readonly', store => store.index('storyId').getAll(storyId)),
    add: record => album.query('readwrite', store => store.put(record)),
    delete: id => album.query('readwrite', store => store.delete(id))
  };
  const storyRefs = () => window.BAOStoryLibrary?.refs?.() || {};
  const latestForStory = async storyId => {
    const id = String(storyId || '').trim();
    if (!id) return null;
    const records = await album.list(id);
    return (Array.isArray(records) ? records : [])
      .sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  };
  const latestForCurrentStory = async () => latestForStory(storyRefs().storyId);
  const notifyAlbumChanged = () => window.dispatchEvent(new CustomEvent('bao:story-image-album-changed'));
  const addGallery = (view, scene) => {
    const { panel, status, urls, overlay } = view;
    const section = document.createElement('details');
    section.style.cssText = 'display:grid;gap:9px;padding-top:10px;border-top:1px solid #596171';
    const summary = document.createElement('summary'); summary.textContent = '本機劇情圖集（可選）';
    const note = document.createElement('small');
    note.textContent = '你可以把外部工具生成好的圖片存回這個故事。圖片只留在目前瀏覽器，不會自動上傳夜灣，也不會送進 AI。';
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/webp';
    picker.setAttribute('aria-label', '選擇要存入本機圖集的圖片');
    const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:9px';
    const current = storyRefs();
    if (!current.storyId || !current.chapterId) {
      picker.disabled = true;
      note.textContent += ' 目前沒有已建立的故事章節，暫不能收藏。';
    }
    const paint = async () => {
      urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
      grid.replaceChildren();
      if (!current.storyId) return;
      const records = (await album.list(current.storyId)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      for (const item of records) {
        if (!overlay.isConnected) return;
        const card = document.createElement('div'); card.style.cssText = 'min-width:0;display:grid;gap:6px;padding:6px;border:1px solid #566072;border-radius:9px';
        const image = document.createElement('img');
        const url = URL.createObjectURL(item.file); urls.add(url);
        image.src = url; image.alt = plain(item.name || '故事圖片');
        image.style.cssText = 'width:100%;height:115px;object-fit:cover;border-radius:6px';
        const label = document.createElement('small');
        label.textContent = `${item.chapterLabel || '章節'} · ${item.messageLabel || '場景'}`;
        const remove = button('刪除圖片', async () => {
          if (!window.confirm('確定從這台裝置刪除這張圖片？無法復原。')) return;
          try { await album.delete(item.id); notifyAlbumChanged(); await paint(); status.textContent = '圖片已從本機圖集刪除。'; }
          catch (error) { status.textContent = `刪除失敗：${error.message}`; }
        });
        card.append(image, label, remove); grid.append(card);
      }
      if (!records.length) grid.textContent = '這個故事還沒有收藏圖片。';
    };
    picker.addEventListener('change', async () => {
      const image = picker.files?.[0]; picker.value = '';
      if (!image) return;
      if (!['image/png','image/jpeg','image/webp'].includes(image.type) || image.size === 0 || image.size > 5*1024*1024) {
        status.textContent = '只支援 PNG／JPG／WebP，單張不超過 5 MB。'; return;
      }
      try {
        await album.add({
          id:window.crypto?.randomUUID?.() || `image-${Date.now()}-${Math.random()}`,
          storyId:current.storyId, chapterId:current.chapterId,
          messageId:scene.id || `legacy-${scene.index}`,
          chapterLabel:current.chapterLabel || '章節',
          messageLabel:scene.index >= 0 ? `訊息 ${scene.index + 1}` : '目前場景',
          characterId:String(window.App?.activeCharacter?.id || ''),
          name:plain(image.name), file:image, createdAt:new Date().toISOString()
        });
        notifyAlbumChanged(); await paint(); status.textContent = '圖片已存入這台裝置的本機圖集。';
      } catch (error) { status.textContent = `圖片儲存失敗：${error?.message || '儲存空間可能不足'}`; }
    });
    section.append(summary, note, picker, grid); panel.append(section);
    void paint().catch(error => { grid.textContent = '圖片庫目前無法使用。'; status.textContent = error.message; });
  };
  const openPlayer = (index = null) => {
    const card = App.activeCharacter;
    if (!card) return;
    const scene = sceneAt(index);
    const { overlay, panel, status, close, urls, dismiss, cleanup } = dialog(
      '將此刻化成畫面',
      '夜灣只用你目前選擇的文字模型整理提示詞，不會直接呼叫圖片／影片生成服務。BYOK 依你的服務商計費；夜灣燈火依既有文字模型規則計費。'
    );
    const sceneInfo = document.createElement('small');
    sceneInfo.textContent = scene.index >= 0
      ? `指定場景：第 ${scene.index + 1} 則訊息（只讀到這一幕，不帶入後面的故事）`
      : '目前尚無 AI 回覆，可先查看作者視覺設定。';

    const controls = document.createElement('div'); controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const mode = selectField('輸出', [['image','圖片 Prompt'],['video','影片 Prompt'],['both','圖片＋影片'],['auto','自動判斷']]);
    const style = selectField('風格', [['auto','自動'],['photorealistic','寫實'],['cinematic','電影感'],['anime','動漫'],['illustration','插畫']]);
    const composition = selectField('構圖／鏡位', [['auto','自動'],['close-up','特寫'],['medium-shot','半身'],['full-body','全身'],['first-person','第一人稱'],['wide-angle','廣角']]);
    controls.append(mode.wrap, style.wrap, composition.wrap);

    const instruction = textarea('這次想怎麼拍？（可留空）', '', 3);
    instruction.field.placeholder = '例如：低機位、由下往上、近大遠小';

    const profileDetails = document.createElement('details');
    const profileSummary = document.createElement('summary'); profileSummary.textContent = '作者視覺設定／角色固定外觀';
    const profile = textarea('視覺 continuity（只影響這次 Prompt，不會改動角色卡）', plain(profileOf(card)), 5);
    profileDetails.append(profileSummary, profile.wrap);

    const understanding = textarea('AI 理解的畫面', '', 4);
    const imagePrompt = textarea('圖片 Prompt', '', 7);
    const videoPrompt = textarea('影片 Prompt', '', 7);
    const negativePrompt = textarea('Negative Prompt（外部工具不一定支援）', '', 4);
    const continuityPrompt = textarea('角色一致性／跨張固定資訊', '', 4);

    const generate = button('生成畫面提示詞', async () => {
      if (!scene.context) { status.textContent = '目前沒有可分析的 AI 劇情。'; return; }
      const config = currentTextConfig();
      if (!config || !window.API?.send) {
        status.textContent = '請先完成文字模型連線；BYOK 需要 API Key，夜灣燈火需要先登入帳號。';
        return;
      }
      generate.disabled = true; status.textContent = '正在把這一幕整理成畫面提示詞……';
      try {
        const response = await API.send(config, buildVisualMessages({
          card, profile:profile.field.value, scene,
          mode:mode.field.value, style:style.field.value, composition:composition.field.value,
          instruction:instruction.field.value
        }));
        const parsed = normalizeResult(response?.text);
        understanding.field.value = parsed.understanding;
        imagePrompt.field.value = parsed.image_prompt;
        videoPrompt.field.value = parsed.video_prompt;
        negativePrompt.field.value = parsed.negative_prompt;
        continuityPrompt.field.value = parsed.continuity_prompt;
        status.textContent = parsed.image_prompt || parsed.video_prompt
          ? '提示詞已生成。可修改後複製到你喜歡的生成工具；不會更動故事。'
          : '文字模型沒有回傳可用的畫面提示詞。';
      } catch (error) {
        status.textContent = `提示詞產生失敗：${error?.message || '未知錯誤'}`;
      } finally { generate.disabled = false; }
    });

    const output = () => ({
      understanding:understanding.field.value,
      image_prompt:imagePrompt.field.value,
      video_prompt:videoPrompt.field.value,
      negative_prompt:negativePrompt.field.value,
      continuity_prompt:continuityPrompt.field.value
    });
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    actions.append(
      generate,
      button('複製圖片 Prompt', () => copy(imagePrompt.field.value, status)),
      button('複製影片 Prompt', () => copy(videoPrompt.field.value, status)),
      button('複製完整 Prompt', () => copy(bundle(output()), status))
    );
    panel.append(
      sceneInfo, controls, instruction.wrap, profileDetails,
      understanding.wrap, imagePrompt.wrap, videoPrompt.wrap, negativePrompt.wrap, continuityPrompt.wrap,
      actions
    );
    addGallery({ overlay, panel, status, close, urls, dismiss, cleanup }, scene);
    panel.append(status, close);
  };
  const openAuthor = () => {
    const { panel, status, close } = dialog('作者圖片提示詞設定', '匯入夜灣角色 JSON，填寫視覺設定並下載修改後的角色卡。此操作完全在本機進行，不呼叫 API。');
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
    if (!chat) return;
    const aside = chat.querySelector('.chat-layout > aside');
    if (aside && !aside.querySelector('[data-bao-image-latest]')) {
      const trigger = button('🎨 將此刻化成畫面', () => openPlayer());
      trigger.dataset.baoImageLatest = '1'; trigger.className = 'secondary'; aside.append(trigger);
    }

    const stream = document.getElementById('chat-stream');
    const nodes = [...(stream?.querySelectorAll(':scope > .message') || [])];
    const messages = Chat.messages || [];
    const offset = nodes.length - messages.length;
    if (offset === 0 || offset === 1) {
      for (let i = 0; i < messages.length; i++) {
        const item = messages[i], node = nodes[i + offset];
        if (item?.role !== 'assistant' || !node?.classList.contains('assistant') || node.querySelector('[data-bao-scene-prompt]')) continue;
        const trigger = button('🎨 畫面', () => openPlayer(i));
        trigger.dataset.baoScenePrompt = '1'; trigger.className = 'bao-scene-prompt-action';
        trigger.style.cssText = 'margin:5px 8px;padding:5px 9px;border:1px solid #53687b;border-radius:9px;background:#21303c;color:#eaf9f6;font-size:12px';
        node.append(trigger);
      }
    }

    const tools = document.querySelector('.character-tools');
    if (tools && !tools.querySelector('[data-bao-author-image-prompt]')) {
      const trigger = button('作者畫面提示詞設定', openAuthor);
      trigger.dataset.baoAuthorImagePrompt = '1'; tools.append(trigger);
    }
  };
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; mount(); });
  };
  const stream = document.getElementById('chat-stream');
  if (stream) new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes]
      .some(node => node.nodeType === 1 && node.classList?.contains('message')))) schedule();
  }).observe(stream, { childList:true });
  const previous = App.renderChatShell?.bind(App);
  if (previous) App.renderChatShell = (...args) => { const result = previous(...args); schedule(); return result; };
  schedule();
  const api = Object.freeze({ openPlayer, openAuthor, mount, profileOf, normalizeResult, buildVisualMessages, album, storyRefs, latestForStory, latestForCurrentStory });
  window.BAOStoryImagePrompts = api;
  window.BAOStoryImageMoments = api;
})();