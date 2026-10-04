// Pure hosted chat input normalization shared by provider dispatch paths.
// Keep this module independent of runtime bindings, storage, billing and providers.
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

const WorkerChatInput = Object.freeze({
  normalizeMessages,
  normalizeHostedSessionId,
});

export {
  WorkerChatInput,
  normalizeHostedSessionId,
  normalizeMessages,
};
