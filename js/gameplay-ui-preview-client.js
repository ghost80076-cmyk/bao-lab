/* BAO/LAB Gameplay UI preview client (parent side). Used by the composer to drive gameplay-ui-preview.html.
 *
 * - Sends the raw draft and a TEST state to the iframe; never the real story state.
 * - Accepts messages only from that iframe's window and from this page's own origin.
 * - Resizes the iframe itself, so the iframe's real viewport (and with it the production CSS and
 *   Stage tier detection) changes, instead of scaling a container.
 */
(function(root) {
  'use strict';
  const Protocol = root.BAOGameplayUIPreviewProtocol;

  function createPreviewClient(iframe, options = {}) {
    if (!Protocol) throw new Error('gameplay-ui-preview-protocol-core.js must load first');
    if (!iframe || iframe.tagName !== 'IFRAME') throw new Error('an iframe element is required');
    const origin = options.origin || root.location.origin;
    const listeners = { ready: [], rendered: [], state: [], notice: [] };
    let isReady = false;
    let current = null; // last render payload; re-sent whenever the preview document (re)loads

    const send = (type, payload) => {
      const target = iframe.contentWindow;
      if (!target) return false;
      target.postMessage(Protocol.makeMessage(type, payload), origin);
      return true;
    };

    const emit = (name, payload) => (listeners[name] || []).slice().forEach(fn => { try { fn(payload); } catch (_) {} });

    const onMessage = event => {
      const result = Protocol.validateMessage(event, {
        allowed: Protocol.FROM_PREVIEW,
        expectedOrigin: origin,
        expectedSource: iframe.contentWindow
      });
      if (!result.ok) return;
      // "ready" is posted by every new preview document, possibly before the iframe's own load event,
      // so readiness is tracked from this message only. A reloaded preview gets the last render again.
      if (result.type === 'ready') { isReady = true; if (current) send('render', current); }
      emit(result.type, result.payload);
    };
    root.addEventListener('message', onMessage);

    return {
      /** Render a raw draft with a test state. Sent as soon as the iframe says it is ready. */
      render(schema, state, panelId) {
        current = { schema, state: state || {}, panelId: panelId || '' };
        if (isReady) send('render', current);
      },
      setState(state) { send('set-state', { state: state || {} }); },
      reset() { send('reset', {}); },
      /** Change the iframe's actual width (and optionally height) in CSS pixels. */
      setViewport(width, height) {
        iframe.style.width = `${Math.max(240, Math.min(2560, Math.round(Number(width) || 0)))}px`;
        if (height) iframe.style.height = `${Math.max(240, Math.round(Number(height)))}px`;
      },
      on(name, fn) { if (listeners[name]) listeners[name].push(fn); return () => { listeners[name] = listeners[name].filter(x => x !== fn); }; },
      destroy() { root.removeEventListener('message', onMessage); Object.keys(listeners).forEach(k => { listeners[k] = []; }); }
    };
  }

  root.BAOGameplayUIPreviewClient = Object.freeze({ createPreviewClient });
})(typeof self !== 'undefined' ? self : this);
