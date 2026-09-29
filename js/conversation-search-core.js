/* Pure conversation-search helpers. This module never mutates story history. */
(() => {
  'use strict';

  const normalize = value => String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-Hant')
    .replace(/\s+/g, ' ')
    .trim();

  const termsFor = query => normalize(query).split(' ').filter(Boolean);

  const makeSnippet = (content, query, size = 150) => {
    const source = String(content ?? '').replace(/\s+/g, ' ').trim();
    if (!source) return '';
    const haystack = normalize(source);
    const term = termsFor(query)[0] || '';
    const found = term ? haystack.indexOf(term) : 0;
    const start = Math.max(0, found - Math.floor(size / 3));
    const end = Math.min(source.length, start + size);
    return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
  };

  const search = ({ messages = [], greeting = '', query = '', role = 'all', limit = 100 } = {}) => {
    const terms = termsFor(query);
    if (!terms.length) return { total: 0, results: [], truncated: false };
    const sourceMessages = Array.isArray(messages) ? messages : [];
    const records = [];
    const greetingText = String(greeting || '').trim();
    const first = sourceMessages[0];
    const greetingAlreadyStored = Boolean(greetingText && first?.role !== 'user' && (
      first?.greeting === true || normalize(first?.content) === normalize(greetingText)
    ));
    if (greetingText && !greetingAlreadyStored) records.push({ index: -1, id: 'story-greeting', role: 'assistant', turn: 0, content: greetingText });
    let turn = 0;
    sourceMessages.forEach((message, index) => {
      const messageRole = message?.role === 'user' ? 'user' : 'assistant';
      if (messageRole === 'user') turn += 1;
      records.push({
        index,
        id: String(message?.id || `message-${index}`),
        role: messageRole,
        turn,
        content: String(message?.content || '')
      });
    });
    const matches = records.filter(record => {
      if (role !== 'all' && record.role !== role) return false;
      const content = normalize(record.content);
      return terms.every(term => content.includes(term));
    });
    const max = Math.max(1, Number(limit) || 100);
    return {
      total: matches.length,
      truncated: matches.length > max,
      results: matches.slice(0, max).map(record => ({ ...record, snippet: makeSnippet(record.content, query) }))
    };
  };

  const api = Object.freeze({ normalize, termsFor, makeSnippet, search });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BAOConversationSearchCore = api;
})();
