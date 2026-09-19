/* Presentation-only integration: no model calls, prompt changes, or world-state writes. */
(() => {
  'use strict';
  if (!window.App || !window.Chat || !window.BAOScenePresentation) return;
  const KEY = 'bao-lab:scene-view-v1';
  const choices = ['auto', 'general', 'romance', 'intimacy', 'danger', 'mystery'];
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const saved = read();
  const prefs = { enabled: saved.enabled === true, type: choices.includes(saved.type) ? saved.type : 'auto' };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };
  const currentType = () => window.GameState?.current?.scenePresentation || window.GameState?.current?.sceneType || 'general';

  // Scene templates use textContent, so pass narration rather than the model's
  // transport markers. Keep the complete original reply in Chat.messages.
  const narrationText = source => {
    const body = String(source || '')
      .replace(/\[STATUS\][\s\S]*?\[\/STATUS\]/gi, '')
      .replace(/\[SCENE:[a-z-]+\]/gi, '')
      .replace(/\[\/?(?:NARRATION|CHOICE)\]/gi, '').trim();
    if (!/<\/?[a-z][^>]*>/i.test(body)) return body;
    const withBreaks = body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n');
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,template,svg,math').forEach(node => node.remove());
    return (doc.body.textContent || '').trim();
  };

  function paint() {
    const stream = document.getElementById('chat-stream');
    if (!stream || !App.activeCharacter || App.config?.offlineWorldPreview || App.__requestPending) return;
    const nodes = [...stream.querySelectorAll(':scope > .message')];
    const messages = Chat.messages;
    // Never repaint the uncommitted streaming bubble or an untracked API error.
    const greetingOnly = messages.length === 0 && nodes.length === 1 && nodes[0].classList.contains('assistant');
    let offset = 0;
    if (!greetingOnly && nodes.length !== messages.length) {
      const greeting = nodes[0];
      const knownGreeting = greeting?.dataset.storyGreeting === 'true'
        || greeting?.dataset.messageIndex === '-1'
        || greeting?.querySelector('.bubble')?.dataset.authoredGreeting === 'true';
      if (nodes.length !== messages.length + 1 || !greeting?.classList.contains('assistant') || !knownGreeting) return;
      greeting.dataset.storyGreeting = 'true';
      offset = 1;
    }
    if (!greetingOnly && !messages.every((message, index) =>
      nodes[index + offset]?.classList.contains(message.role === 'user' ? 'user' : 'assistant'))) return;
    const entries = greetingOnly ? [{ role: 'assistant', content: App.activeCharacter.greeting || '', greeting: true }] : messages;
    for (let i = 0; i < entries.length; i++) {
      const message = entries[i];
      const node = nodes[i + offset];
      if (!node || message.role !== 'assistant' || !node.classList.contains('assistant') || node.classList.contains('is-streaming')) continue;
      const bubble = node.querySelector('.bubble');
      if (!bubble || bubble.querySelector('.story-inline-editor')) continue;
      const type = prefs.type === 'auto' ? currentType() : prefs.type;
      const fingerprint = JSON.stringify([message.id || '', message.content, prefs.enabled, type]);
      if (prefs.enabled) {
        // The story reader can replace the bubble after our earlier paint;
        // a matching fingerprint alone does not mean the scene still exists.
        if (bubble.dataset.sceneFingerprint !== fingerprint || !bubble.querySelector('.bao-scene-body')) {
          BAOScenePresentation.render(bubble, narrationText(message.content), { type });
          bubble.dataset.sceneFingerprint = fingerprint;
        }
      } else {
        const renderer = window.BAOSceneHTML;
        if (!renderer?.render) continue;
        // Text and interactive display modes must use the exact same committed
        // source renderer, even after late story-reader decorations.
        const html = renderer.render(message.content, Boolean(message.greeting || greetingOnly));
        if (bubble.dataset.sceneFingerprint || bubble.dataset.sceneType) {
          bubble.style.cssText = '';
          delete bubble.dataset.sceneType;
          delete bubble.dataset.sceneFingerprint;
          bubble.classList.remove('bao-scene-plain');
        }
        if (bubble.innerHTML !== html) bubble.innerHTML = html;
        bubble.classList.toggle('authored-rich-message', renderer.prefs?.mode !== 'native');
      }
    }
  }
  function mount() {
    const aside = document.querySelector('#chat-view aside');
    if (!aside || document.getElementById('bao-scene-view-controls')) return;
    const panel = document.createElement('section');
    panel.id = 'bao-scene-view-controls';
    panel.style.cssText = 'display:grid;gap:8px;padding:12px;margin:12px 0;border:1px solid #7776;border-radius:10px';
    const heading = document.createElement('strong'); heading.textContent = 'HTML 場景版型'; panel.append(heading);
    const toggle = document.createElement('label'); toggle.style.cssText = 'display:flex;gap:8px;align-items:center';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = prefs.enabled;
    toggle.append(checkbox, document.createTextNode('啟用內建場景版型')); panel.append(toggle);
    const label = document.createElement('label'); label.textContent = '場景'; label.style.cssText = 'display:grid;gap:4px';
    const select = document.createElement('select');
    [['auto','自動（依明確世界狀態）'],['general','通用'],['romance','甜蜜戀愛'],['intimacy','成人親密'],['danger','危險／對峙'],['mystery','詭異／解謎']].forEach(([value,text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
    select.value = prefs.type; select.disabled = !prefs.enabled; label.append(select); panel.append(label);
    const note = document.createElement('small'); note.textContent = '只更換本機閱讀版型，不更動原文、角色卡、世界狀態或 API 請求。'; panel.append(note);
    checkbox.addEventListener('change', () => { prefs.enabled = checkbox.checked; select.disabled = !prefs.enabled; persist(); paint(); });
    select.addEventListener('change', () => { prefs.type = select.value; persist(); paint(); });
    aside.append(panel);
  }
  const originalShell = App.renderChatShell;
  App.renderChatShell = function(...args) {
    const result = originalShell.apply(this, args);
    mount(); paint(); setTimeout(paint, 140); // Story reader also decorates at 100ms.
    return result;
  };
  const originalSend = App.sendMessage;
  App.sendMessage = async function(...args) {
    try { return await originalSend.apply(this, args); }
    finally { paint(); setTimeout(paint, 140); }
  };
  const stream = document.getElementById('chat-stream');
  if (stream) {
    let queued = false;
    new MutationObserver(() => {
      if (queued || App.__requestPending) return;
      queued = true;
      queueMicrotask(() => { queued = false; paint(); });
    }).observe(stream, { childList: true, subtree: true });
  }
  window.BAOSceneChat = { prefs, paint, mount, narrationText };
  mount();
})();