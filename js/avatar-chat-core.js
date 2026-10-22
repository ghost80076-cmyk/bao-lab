/* Pure presentation data. Images never belong in a model prompt or message. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOAvatarChatCore = api;
})(typeof window === 'undefined' ? null : window, function() {
  'use strict';
  const MAX_IMAGE = 65536;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function image(value) {
    const src = typeof value === 'string' ? value.trim() : '';
    if (!src || src.length > MAX_IMAGE) return '';
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return src;
    if (/^assets\/[a-zA-Z0-9_./-]+$/.test(src) && !src.split('/').includes('..')) return src;
    if (/^yorubay-asset:\/\/[a-zA-Z0-9_-]{1,80}$/.test(src)) return src;
    try { const url = new URL(src); return url.protocol === 'https:' && !url.username && !url.password && !/[\s<>"']/.test(src) ? src : ''; } catch { return ''; }
  }
  const name = value => String(value || '').trim().slice(0, 100);
  function normalize(input) {
    const used = new Set();
    const cast = (Array.isArray(input?.cast) ? input.cast : []).slice(0, 12).map((person, i) => {
      let id = /^[a-zA-Z0-9_-]{1,80}$/.test(person?.id || '') ? person.id : `cast-${i + 1}`;
      while (used.has(id)) id += '-copy';
      used.add(id);
      return {id, name:name(person?.name), aliases:[...new Set((Array.isArray(person?.aliases) ? person.aliases : []).map(name).filter(Boolean))].slice(0, 8), avatar:image(person?.avatar)};
    }).filter(person => person.name);
    return {version:1, mode:input?.mode === 'avatar_chat' ? 'avatar_chat' : 'standard', cast};
  }
  function parse(source, people) {
    const names = new Map();
    for (const person of people || []) for (const label of new Set([person.name, ...(person.aliases || [])].map(name).filter(Boolean))) {
      // Duplicate names are ambiguous. Never choose an arbitrary person's image.
      const previous = names.get(label);
      names.set(label, previous && previous.id !== person.id ? null : names.has(label) && previous === null ? null : person);
    }
    const parts = [];
    for (const line of String(source || '').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:\*\*)?([^：:\n]{1,104}?)(?:\*\*)?\s*[：:]\s*(.+)$/);
      const person = match && names.get(match[1].trim());
      if (person) parts.push({kind:'speech', person, text:match[2]});
      else if (parts.at(-1)?.kind === 'narration') parts.at(-1).text += '\n' + line;
      else parts.push({kind:'narration', text:line});
    }
    return parts;
  }
  function portrait(person, resolve = image) {
    const src = resolve(person.avatar);
    return `<span class="avatar-chat-portrait" aria-hidden="true"><span>${esc(Array.from(person.name || '？')[0])}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
  }
  function speech(person, text, resolve, transform = value => value) {
    return `<section class="avatar-chat-speech" data-speaker-id="${esc(person.id)}">${portrait(person, resolve)}<div class="avatar-chat-copy"><strong>${esc(transform(person.name))}</strong><div>${esc(transform(text))}</div></div></section>`;
  }
  function render(source, people, resolve, transform = value => value) {
    return `<div class="avatar-chat">${parse(source, people).map(part => part.kind === 'speech'
      ? speech(part.person, part.text, resolve, transform)
      : `<div class="avatar-chat-narration">${esc(transform(part.text))}</div>`).join('')}</div>`;
  }
  return {MAX_IMAGE, image, normalize, parse, esc, portrait, speech, render};
});
