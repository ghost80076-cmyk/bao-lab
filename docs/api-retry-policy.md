# API Retry policy

Phase 0 stability adds a bounded retry policy to the direct BYOK provider transport.

- Retry only HTTP 408, 429, 500, 502, 503 and 504.
- Retry transient browser/network failures such as `TypeError: Failed to fetch`, timeouts and connection resets.
- Never retry player cancellation, authentication/permission errors, missing models, malformed requests or unknown programming errors.
- Default budget: two retries after the first attempt. Connection tests use one retry.
- Respect `Retry-After` when present; otherwise use short exponential backoff capped at 2.4 seconds.
- Retry happens inside the provider transport before a successful result is committed to Chat/GameState, so one successful generation still produces one story turn and one world update.
- A stream is retried only when the initial HTTP request itself fails before an event stream is consumed. Mid-stream failures are not replayed, preventing duplicate streamed text.
- Hosted `bao-credits` requests are intentionally excluded from browser retries until the Worker supports a client idempotency key/result replay contract. Retrying an ambiguous paid request without idempotency could double-charge a wallet.

This policy applies to OpenAI-compatible, Anthropic and Gemini direct/BYOK transports.
