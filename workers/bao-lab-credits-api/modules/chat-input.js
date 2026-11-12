// Pure hosted chat input normalization shared by provider dispatch paths.
// Keep this module independent of runtime bindings, storage, billing and providers.
// Output limits are transport / abuse guards, not model context-window limits.
const MAX_OUTPUT = 8192;
// Gemini reasoning and text share this ceiling. Other task/provider limits stay unchanged.
const maxOutputForRequest = (provider, kind) => provider === 'gemini' && kind === 'summary' ? 16384 : MAX_OUTPUT;
const MAX_PROMPT_BYTES = 192_000;
const MAX_MESSAGES = 100;
const chatInputEncoder = new TextEncoder();

function normalizeMessages(
  messages
) {
  if (
    !Array.isArray(
      messages
    ) ||
    !messages.length ||
    messages.length >
      MAX_MESSAGES
  ) {
    return null;
  }

  if (
    !messages.every(
      (m) =>
        m &&
        [
          "system",
          "user",
          "assistant",
        ].includes(
          m.role
        ) &&
        typeof m.content ===
          "string" &&
        m.content.length >
          0 &&
        m.content.length <=
          80_000
    )
  ) {
    return null;
  }

  if (
    !messages.some(
      (m) =>
        m.role ===
        "user"
    )
  ) {
    return null;
  }

  const simple =
    messages.map(
      ({
        role,
        content,
      }) => ({
        role,
        content,
      })
    );

  const bytes =
    chatInputEncoder.encode(
      JSON.stringify(
        simple
      )
    ).length;

  return (
    bytes <=
    MAX_PROMPT_BYTES
  )
    ? simple
    : null;
}

function normalizeHostedSessionId(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return "";
  }

  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      256 ||
    !/^[A-Za-z0-9._:-]+$/.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

// Only a bounded JSON response contract crosses the client/Worker boundary.
// Omitted means legacy behavior; null means invalid, rejected before reservation.
function normalizeResponseFormat(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some(key => key !== "text")) return null;
  const text = value.text;
  if (!text || typeof text !== "object" || Array.isArray(text) ||
      text.mimeType !== "application/json" ||
      Object.keys(text).some(key => !["mimeType", "schema"].includes(key))) return null;
  if (text.schema !== undefined && (!text.schema || typeof text.schema !== "object" || Array.isArray(text.schema))) return null;
  try {
    const encoded = JSON.stringify(value);
    if (chatInputEncoder.encode(encoded).length > 16_384) return null;
    const bounded = (node, depth = 0) => depth <= 20 &&
      (!node || typeof node !== "object" || Object.values(node).every(child => bounded(child, depth + 1)));
    if (!bounded(value)) return null;
    return JSON.parse(encoded);
  } catch { return null; }
}

const WorkerChatInput = Object.freeze({
  MAX_OUTPUT,
  normalizeResponseFormat,
  maxOutputForRequest,
  normalizeMessages,
  normalizeHostedSessionId,
});

export {
  MAX_OUTPUT,
  normalizeResponseFormat,
  maxOutputForRequest,
  WorkerChatInput,
  normalizeHostedSessionId,
  normalizeMessages,
};
