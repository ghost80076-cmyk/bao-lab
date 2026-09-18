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
  function paint() {
    const stream = document.getElementById('chat-stream');
    if (!stream || !App.activeCharacter) return;
    const messages = Chat.messages.length ? Chat.messages : [{ role: 'assistant', content: App.activeCharacter.greeting || '' }];
    const nodes = [...stream.querySelectorAll(':scope > .message')];
    // Never modify a pending/streaming bubble: only render messages already committed to Chat.messages.
    for (let i = 0; i < messages.length && i < nodes.length; i++) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      const bubble = nodes[i].querySelector('.bubble');
      if (!bubble) continue;
      const type = prefs.type === 'auto' ? currentType() : prefs.type;
      const fingerprint = JSON.stringify([message.id || '', message.content, prefs.enabled, type]);
      if (bubble.dataset.sceneFingerprint === fingerprint) continue;
      if (prefs.enabled) BAOScenePresentation.render(bubble, message.content, { type });
      else {
        bubble.replaceChildren(document.createTextNode(String(message.content || '')));
        bubble.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
        delete bubble.dataset.sceneType;
        bubble.classList.remove('bao-scene-plain');
      }
      bubble.dataset.sceneFingerprint = fingerprint;
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
  App.renderChatShell = function(...args) { const result = originalShell.apply(this, args); mount(); paint(); return result; };
  const originalSend = App.sendMessage;
  App.sendMessage = async function(...args) { const result = await originalSend.apply(this, args); paint(); return result; };
  window.BAOSceneChat = { prefs, paint, mount };
  mount();
})();