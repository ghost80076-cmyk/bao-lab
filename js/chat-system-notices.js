/* Request notices live outside the story. Stream deltas remain in the story bubble. */
(() => {
  'use strict';
  if (window.BAOChatSystemNotices || !window.App || !window.Chat) return;
  const chat = document.getElementById('chat-view');
  const stream = document.getElementById('chat-stream');
  const composer = chat?.querySelector('.composer');
  if (!chat || !stream || !composer) return;

  const styles = document.createElement('style');
  styles.id = 'bao-chat-system-notice-styles';
  styles.textContent = `
    #bao-chat-system-notices[hidden]{display:none!important}
    #bao-chat-system-notices{margin:12px 0;padding:12px 14px;border:1px solid #617381;border-radius:12px;background:#1b2832;color:#f4f8fb;line-height:1.6;overflow-wrap:anywhere}
    #bao-chat-system-notices[data-state="error"]{border-color:#9c7957;background:#322820;color:#ffddb9}
    #bao-chat-system-notices[data-state="cancelled"]{border-color:#777b86;background:#292b34;color:#eeeef3}
    #bao-chat-system-notices[data-state="truncated"]{border-color:#b78d57;background:#322b23;color:#ffe2b6}
    #bao-chat-truncation-hint,#bao-chat-memory-progress{font-size:13px}
    #bao-chat-memory-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    #bao-chat-memory-actions[hidden],#bao-chat-memory-progress[hidden]{display:none!important}
    #bao-chat-memory-actions button{white-space:normal;min-height:44px}
    #bao-chat-memory-actions p{flex-basis:100%;margin:0;color:inherit;font-size:12px}
    #bao-chat-system-notices strong{display:block;font-size:13px;margin-bottom:3px}
    #bao-chat-system-notices #bao-chat-request-status{font-size:13px}
    #bao-chat-system-notices #bao-chat-send-feedback{margin:5px 0 0;padding:0;border:0;background:transparent;color:inherit;box-shadow:none}
    #bao-chat-system-notices #bao-chat-send-feedback[hidden]{display:none!important}
    #chat-stream > .message.assistant .bubble:empty{padding:0;border:0;min-height:0}
  `;
  document.head.append(styles);

  const region = document.createElement('section');
  region.id = 'bao-chat-system-notices';
  region.setAttribute('aria-label', '系統通知');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.hidden = true;
  const heading = document.createElement('strong');
  heading.textContent = '系統通知';
  const status = document.createElement('div');
  status.id = 'bao-chat-request-status';
  const truncation = document.createElement('div');
  truncation.id = 'bao-chat-truncation-hint';
  truncation.hidden = true;
  region.append(heading, status, truncation);
  composer.before(region);

  const memoryProgress = document.createElement('div');
  memoryProgress.id = 'bao-chat-memory-progress';
  memoryProgress.hidden = true;
  const memoryActions = document.createElement('div');
  memoryActions.id = 'bao-chat-memory-actions';
  memoryActions.hidden = true;
  const retryMemory = document.createElement('button');
  retryMemory.type = 'button';
  retryMemory.className = 'secondary';
  retryMemory.textContent = '重試自動記憶整理';
  const inspectMemory = document.createElement('button');
  inspectMemory.type = 'button';
  inspectMemory.className = 'secondary';
  inspectMemory.textContent = '查看記憶狀態';
  const memoryCost = document.createElement('p');
  memoryCost.className = 'note';
  memoryCost.textContent = '重試會使用目前的整理模型並產生費用；不會重新送出故事。手動整理成筆記不會推進自動摘要進度。';
  memoryActions.append(retryMemory, inspectMemory, memoryCost);
  region.append(memoryProgress, memoryActions);
  inspectMemory.addEventListener('click', () => window.BAOMemoryWorkbench?.open?.());
  retryMemory.addEventListener('click', () => {
    window.BAOMemoryWorkbench?.open?.();
    if (App.config?.memory?.mode === 'smart') window.BAOMemoryWorkbench?.retryAutoMemory?.();
  });
  const memoryTasks = new Map();
  const beginMemoryProgress = (message, owner) => {
    if (!owner || window.GameState?.current !== owner) return null;
    const task = {};
    memoryTasks.set(task, { message, owner });
    sync();
    return task;
  };
  const updateMemoryProgress = (task, message) => {
    if (!memoryTasks.has(task)) return;
    memoryTasks.get(task).message = message;
    sync();
  };
  const endMemoryProgress = task => { memoryTasks.delete(task); sync(); };

  let feedback = null;
  let feedbackObserver = null;
  let truncationOwner = null;
  const truncatedReasons = new Set(['LENGTH', 'MAX_TOKENS', 'MAX_OUTPUT_TOKENS', 'MAX_COMPLETION_TOKENS']);
  const sync = () => {
    if (truncationOwner && truncationOwner !== window.GameState?.current) {
      truncationOwner = null;
      truncation.textContent = '';
      truncation.hidden = true;
    }
    const pending = Boolean(App.__requestPending || composer.classList.contains('story-request-pending'));
    const message = feedback && !feedback.hidden ? feedback.textContent.trim() : '';
    const cancelled = message.startsWith('已取消本次生成');
    const isTruncated = Boolean(truncationOwner && !truncation.hidden);
    for (const [task, value] of memoryTasks) {
      if (value.owner !== window.GameState?.current) memoryTasks.delete(task);
    }
    const memory = memoryTasks.values().next().value;
    memoryProgress.textContent = memory?.message || '';
    memoryProgress.hidden = !memory;
    const memoryFailure = Boolean(message && /記憶|摘要|上下文|送出內容.*過大/.test(message));
    memoryActions.hidden = pending || Boolean(memory) || !memoryFailure || !window.BAOMemoryWorkbench;
    retryMemory.textContent = App.config?.memory?.mode === 'smart' ? '重試自動記憶整理' : '開啟自動記憶設定';
    status.textContent = memory ? '正在整理記憶…' : pending ? '正在生成故事…' : cancelled ? '生成已取消' : message ? '請求未完成' : isTruncated ? '回覆可能遭到截斷' : '';
    status.hidden = !status.textContent;
    region.dataset.state = memory || pending ? 'pending' : cancelled ? 'cancelled' : message ? 'error' : isTruncated ? 'truncated' : 'idle';
    region.hidden = !pending && !message && !isTruncated && !memory;
  };
  const clearCompletion = () => {
    truncationOwner = null;
    truncation.textContent = '';
    truncation.hidden = true;
    sync();
  };
  const reportCompletion = (result, owner) => {
    if (!owner || window.GameState?.current !== owner) return;
    const reason = String(result?.finishReason || result?.finish_reason || '').trim().toUpperCase();
    if (!truncatedReasons.has(reason)) return clearCompletion();
    truncationOwner = owner;
    const hosted = Boolean(window.BAOCreditsPilot?.isAccountConnection?.(App.config?.api));
    truncation.textContent = '供應商回報已達輸出長度限制；本輪正文、選項或末尾狀態欄可能不完整。已生成的故事仍保留。'
      + (hosted
        ? '可在「⚙ 記憶／Token／成本」調高單次輸出（夜灣燈火最高 8,192 Token），或縮短回覆長度。'
        : '可在「⚙ 記憶／Token／成本」調高單次輸出，實際上限仍依模型與服務商規格。');
    truncation.hidden = false;
    sync();
  };
  const attachFeedback = () => {
    const node = document.getElementById('bao-chat-send-feedback');
    if (!node || feedback === node) return;
    feedbackObserver?.disconnect();
    feedback = node;
    region.append(feedback);
    feedbackObserver = new MutationObserver(sync);
    feedbackObserver.observe(feedback, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
    sync();
  };
  attachFeedback();
  // The existing failure handler loads later; move its existing alert here once.
  if (!feedback) {
    const parentObserver = new MutationObserver(() => {
      attachFeedback();
      if (feedback) parentObserver.disconnect();
    });
    parentObserver.observe(composer.parentElement, { childList: true });
  }
  new MutationObserver(sync).observe(composer, { attributes: true, attributeFilter: ['class'] });
  // Entering another story toggles the chat view; clear previous-owner notices immediately.
  new MutationObserver(sync).observe(chat, { attributes: true, attributeFilter: ['class'] });

  // A waiting indicator is a system message, not a story sentence. The actual
  // streamed text still appears progressively in this same temporary bubble.
  const hideLoadingText = () => {
    if (!App.__requestPending) return;
    const last = stream.lastElementChild;
    if (!last?.matches('.message.assistant:not(.is-streaming)')) return;
    const bubble = last.querySelector('.bubble');
    if (bubble?.textContent.trim() === '正在生成……') bubble.textContent = '';
  };
  new MutationObserver(hideLoadingText).observe(stream, { childList: true });
  sync();
  window.BAOChatSystemNotices = { region, sync, reportCompletion, clearCompletion, beginMemoryProgress, updateMemoryProgress, endMemoryProgress };
})();
