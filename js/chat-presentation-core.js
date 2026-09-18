/* Presentation-only filtering: never writes story history or GameState. */
(() => {
  'use strict';
  const heading = /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*(?:【\s*)?當前場景資訊\s*(?:】\s*)?[：:]?\s*(?:\*\*)?\s*$/;
  const separator = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const statusField = /^\s*(?:[-*•]\s*)?(?:\*\*)?\s*(?:時間|日期|地點|位置|天氣|附近\s*NPC|在場\s*NPC|環境威脅|當前事件|場景|目前狀態|危險程度|玩家位置)\s*[：:]\s*(?:\*\*)?\s*\S.*$/i;
  const stripStatusAppendix = raw => {
    const source = String(raw ?? '');
    if (!source.includes('當前場景資訊')) return source;
    const lines = source.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!heading.test(lines[i])) continue;
      let end = i + 1;
      let found = 0;
      let lastFieldEnd = end;
      while (end < lines.length) {
        const line = lines[end];
        if (statusField.test(line)) { found++; lastFieldEnd = ++end; continue; }
        if (!line.trim() && found && end + 1 < lines.length && statusField.test(lines[end + 1])) { end++; continue; }
        break;
      }
      // An isolated heading or a paragraph mentioning a status is ordinary prose.
      if (found < 2) continue;
      let start = i;
      if (start > 0 && separator.test(lines[start - 1])) start--;
      const before = lines.slice(0, start).join('\n').trimEnd();
      const after = lines.slice(lastFieldEnd).join('\n').trimStart();
      return [before, after].filter(Boolean).join('\n\n');
    }
    return source;
  };
  const api = Object.freeze({ stripStatusAppendix });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BAOChatPresentationCore = api;
})();
