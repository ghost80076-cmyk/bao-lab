/* BAO/LAB Gameplay UI preview protocol. Pure helpers: no DOM, storage, network, or model calls.
 *
 * Parent (composer) and the preview iframe exchange JSON-only messages through
 * postMessage. Every inbound message is checked for source window, origin and
 * shape before anything is rendered.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOGameplayUIPreviewProtocol = api;
})(typeof self !== 'undefined' ? self : null, function() {
  'use strict';

  const CHANNEL = 'bao-gameplay-preview';
  const VERSION = 1;
  const MAX_BYTES = 256 * 1024;
  const MAX_DEPTH = 24;
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  // parent -> preview
  const TO_PREVIEW = Object.freeze(['render', 'set-state', 'reset', 'set-image', 'refresh']);
  // A scene test image travels as base64 inside the JSON payload (the composer downsizes it first).
  const IMAGE_MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
  const MAX_IMAGE_CHARS = 200 * 1024;
  // preview -> parent
  const FROM_PREVIEW = Object.freeze(['ready', 'rendered', 'state', 'notice', 'dismiss']);

  const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  /** True when value is plain JSON data within the depth limit, with no pollution keys. */
  function isPlainJSON(value, depth = 0) {
    if (depth > MAX_DEPTH) return false;
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(item => isPlainJSON(item, depth + 1));
    if (isObject(value)) {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
      return Object.keys(value).every(k => !BLOCKED_KEYS.has(k) && isPlainJSON(value[k], depth + 1));
    }
    return false;
  }

  /** UTF-8 byte length of a string (String.length counts UTF-16 units, which undercounts CJK text). */
  const utf8ByteLength = text => new TextEncoder().encode(text).byteLength;

  /** Serialized payload size in UTF-8 bytes; Infinity when it cannot be serialized. */
  const payloadBytes = value => {
    try { return utf8ByteLength(JSON.stringify(value)); } catch (_) { return Infinity; }
  };

  const fail = reason => ({ ok: false, reason });

  /**
   * Validate an inbound MessageEvent-like object.
   * @param {{data:any, origin:string, source:any}} event
   * @param {{allowed:readonly string[], expectedOrigin:string, expectedSource:any}} rule
   */
  function validateMessage(event, rule) {
    if (!event || !rule) return fail('bad_arguments');
    if (!rule.expectedOrigin || rule.expectedOrigin === 'null') return fail('opaque_origin_not_allowed');
    if (event.origin !== rule.expectedOrigin) return fail('bad_origin');
    if (!rule.expectedSource || event.source !== rule.expectedSource) return fail('bad_source');
    const data = event.data;
    if (!isObject(data)) return fail('bad_shape');
    if (data.channel !== CHANNEL || data.version !== VERSION) return fail('bad_channel');
    if (typeof data.type !== 'string' || !rule.allowed.includes(data.type)) return fail('bad_type');
    if (data.payload !== undefined && !isObject(data.payload)) return fail('bad_payload');
    const payload = data.payload || {};
    const checked = validatePayload(data.type, payload);
    if (!checked.ok) return checked;
    return { ok: true, type: data.type, payload };
  }

  /** Shape, JSON-safety and size checks for one payload; the sender can run it before posting. */
  function validatePayload(type, payload) {
    if (!isObject(payload)) return fail('bad_payload');
    if (!isPlainJSON(payload)) return fail('payload_not_plain_json');
    if (payloadBytes(payload) > MAX_BYTES) return fail('payload_too_large');
    return checkPayload(type, payload);
  }

  function checkPayload(type, payload) {
    if (type === 'render') {
      if (!isObject(payload.schema)) return fail('render_needs_schema');
      if (payload.state !== undefined && !isObject(payload.state)) return fail('render_state_not_object');
      if (payload.panelId !== undefined && typeof payload.panelId !== 'string') return fail('render_panel_not_string');
    }
    if (type === 'set-state' && !isObject(payload.state)) return fail('set_state_needs_state');
    if (type === 'set-image') {
      if (typeof payload.data !== 'string') return fail('image_needs_data');
      if (payload.data === '') return { ok: true };                  // an empty string clears the test image
      if (!IMAGE_MIMES.includes(payload.mime)) return fail('image_mime_not_allowed');
      if (payload.data.length > MAX_IMAGE_CHARS) return fail('image_too_large');
      if (payload.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.data)) return fail('image_not_base64');
    }
    return { ok: true };
  }

  const makeMessage = (type, payload = {}) => ({ channel: CHANNEL, version: VERSION, type, payload });

  return Object.freeze({ CHANNEL, VERSION, MAX_BYTES, MAX_DEPTH, IMAGE_MIMES, MAX_IMAGE_CHARS, TO_PREVIEW, FROM_PREVIEW, isPlainJSON, utf8ByteLength, payloadBytes, validatePayload, validateMessage, makeMessage });
});
