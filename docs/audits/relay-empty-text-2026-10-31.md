# 2026-10-31 Hosted Gemini failure triage — relay 500 vs empty text

## Evidence and scope

An exported 100-request admin usage excerpt (2026-10-30–31, Taiwan time) included:
- **13** `chat` failures labelled `provider_http_error · HTTP 500 · aws_relay`, clustered at ~65–66 seconds, with repeated **107,924** or **111,469** `request_bytes` values.
- **34** `provider_empty_text` failures spanning `chat`, `summary` and `status`; many returned in roughly 1–2 seconds.
- **2** indeterminate but refunded requests. Failed/refunded local wallet entries are **not** evidence that Google's upstream billing cost was zero.

The byte counts represent the serialized **outbound Worker-to-relay request**, not a response length. Identical byte counts do **not** prove identical prompts or provider-side retries.

The Worker `aws_relay` client timeout is **170,000 ms** in `modules/provider-transport.js`. A ~65,000 ms upstream HTTP 500 is not the same thing as that client timeout. The AWS service implementation/configuration and its actual runtime logs were **not available** for this PR; no specific 60-second proxy or Gunicorn root cause is asserted.

## Changes made in this PR

- Preserve sanitized `elapsed_ms`, `timeout_ms`, `request_bytes`, HTTP status and route in the standard `provider_http_error` failure response. Do not convert an HTTP 500 into a client timeout.
- For Gemini 200 responses with unusable visible text, retain the safe shape enum (`no_candidates`, `no_parts`, `empty_parts`, `thought_only`, `no_text_parts`, `blank_text`) alongside `finish_reason`, `prompt_block_reason`, candidate count and reported upstream input/output token counts.
- Exclude `thought: true` parts from visible story text. Record provider-reported tokens only as **observations**, not billable, settled or reconciled usage.
- Extend the existing `api_usage_diagnostics` table additively for existing D1 deployments; display fields in the admin usage history. No raw prompts, keys, response body, model thoughts, or raw upstream error payloads are retained.
- Preserve the existing no-automatic-resend approach for Hosted HTTP 500; a relay may have processed the original request. Never loop on an opaque 500 or `provider_empty_text` as a substitute for investigating the failure.

## AWS operator checklist (requires separate infrastructure access)

1. For **2026-10-31 08:40–09:10 Asia/Taipei** (00:40–01:10 UTC), correlate Worker `request_id`, internal AWS relay access logs, upstream generation ID where present, and Google API request status. Do not log or transmit prompts or API secrets.
2. Inspect the specific AWS application's effective request timeout (application server, reverse proxy, load balancer, outbound HTTP client) and compare with failures at ~65 seconds. Confirm whether the application returned an HTTP 500, an upstream gateway generated one, or a process terminated. Do not assume any specific component from timing alone.
3. Compare successful and failing requests near **107,924** and **111,469** bytes; check status, JSON payload shape, upstream headers, actual `usageMetadata`, `finishReason` and `promptFeedback.blockReason`. Request byte count is **not** model token count and does not by itself show a context-limit failure.
4. Confirm the exact deployed Worker SHA, AWS relay release/config version, and Gemini project route for that time. Merged GitHub PRs alone do not prove which production version a request used.
5. Independently reconcile Google billing for refunded requests. A failed local settlement is not provider-invoice proof.

## Required release verification

- Automated mock-provider cases: relay HTTP 500; 200 with no candidates; thought-only exhausted output; prompt safety block; visible text mixed with thought parts.
- Compatibility: original `api_usage_diagnostics` schema is migrated without data loss and the admin read route works both before and after migration.
- After CI, **separate live staging testing** with a controlled long Chinese story/request size near incident values and explicit `chat`, `status`, `summary` paths. Verify no successful summary checkpoint is advanced on failure and no retry storm.
- Without AWS logs and controlled live calls, close this PR as *diagnosis and safe error-handling improvement*, **not** as proven elimination of the 65-second upstream HTTP 500.

Related existing merged changes: #885, #887, #889. Keep their summarization, checkpoint and low-thinking behavior intact.
