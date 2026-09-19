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
  region.append(heading, status);
  composer.before(region);

  let feedback = null;
  let feedbackObserver = null;
  const sync = () => {
    const pending = Boolean(App.__requestPending || composer.classList.contains('story-request-pending'));
    const message = feedback && !feedback.hidden ? feedback.textContent.trim() : '';
    const cancelled = message.startsWith('已取消本次生成');
    status.textContent = pending ? '正在生成故事…' : cancelled ? '生成已取消' : message ? '請求未完成' : '';
    status.hidden = !status.textContent;
    region.dataset.state = pending ? 'pending' : cancelled ? 'cancelled' : message ? 'error' : 'idle';
    region.hidden = !pending && !message;
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
  window.BAOChatSystemNotices = { region, sync };
})();
