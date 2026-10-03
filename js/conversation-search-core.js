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

  const dateThreshold = (range = 'all', now = Date.now()) => {
    if (range === 'all') return null;
    const current = new Date(now);
    if (Number.isNaN(current.getTime())) return null;
    if (range === 'today') {
      current.setHours(0, 0, 0, 0);
      return current.getTime();
    }
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 0;
    return days ? current.getTime() - days * 86400000 : null;
  };

  const messageRecords = ({ messages = [], greeting = '', greetingCreatedAt = '', chapterId = '', chapterLabel = '' } = {}) => {
    const sourceMessages = Array.isArray(messages) ? messages : [];
    const records = [];
    const greetingText = String(greeting || '').trim();
    const first = sourceMessages[0];
    const greetingAlreadyStored = Boolean(greetingText && first?.role !== 'user' && (
      first?.greeting === true || normalize(first?.content) === normalize(greetingText)
    ));
    if (greetingText && !greetingAlreadyStored) records.push({ index: -1, id: 'story-greeting', role: 'assistant', turn: 0, content: greetingText, createdAt: greetingCreatedAt, chapterId, chapterLabel });
    let turn = 0;
    sourceMessages.forEach((message, index) => {
      const messageRole = message?.role === 'user' ? 'user' : 'assistant';
      if (messageRole === 'user') turn += 1;
      records.push({
        index,
        id: String(message?.id || `message-${index}`),
        role: messageRole,
        turn,
        content: String(message?.content || ''),
        createdAt: String(message?.createdAt || ''),
        chapterId: String(message?.chapterId || chapterId || ''),
        chapterLabel: String(message?.chapterLabel || chapterLabel || '')
      });
    });
    return records;
  };

  const search = ({ records = null, messages = [], greeting = '', greetingCreatedAt = '', chapterId = '', chapterLabel = '', query = '', role = 'all', chapter = 'all', date = 'all', now = Date.now(), limit = 100 } = {}) => {
    const terms = termsFor(query);
    if (!terms.length) return { total: 0, results: [], truncated: false };
    const sourceRecords = Array.isArray(records)
      ? records.map((record, index) => ({
          ...record,
          index: Number(record?.index ?? index),
          id: String(record?.id || `message-${index}`),
          role: record?.role === 'user' ? 'user' : 'assistant',
          turn: Math.max(0, Number(record?.turn || 0)),
          content: String(record?.content || ''),
          createdAt: String(record?.createdAt || ''),
          chapterId: String(record?.chapterId || ''),
          chapterLabel: String(record?.chapterLabel || '')
        }))
      : messageRecords({ messages, greeting, greetingCreatedAt, chapterId, chapterLabel });
    const threshold = dateThreshold(date, now);
    const matches = sourceRecords.filter(record => {
      if (role !== 'all' && record.role !== role) return false;
      if (chapter !== 'all' && record.chapterId !== chapter) return false;
      if (threshold !== null) {
        const createdAt = Date.parse(record.createdAt);
        if (Number.isNaN(createdAt) || createdAt < threshold || createdAt > new Date(now).getTime()) return false;
      }
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

  const api = Object.freeze({ normalize, termsFor, makeSnippet, dateThreshold, messageRecords, search });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BAOConversationSearchCore = api;
})();
