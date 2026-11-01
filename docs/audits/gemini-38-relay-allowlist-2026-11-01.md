# Gemini 3.8 Relay allowlist incident — 2026-11-01

## Confirmed cause

The live `bao-backend.service` in Sydney runs `/opt/bao-backend/app.py`.
`allowed_gemini_models()` reads `GEMINI_MODELS`, falling back to
`DEFAULT_GEMINI_MODELS`. The process had no `GEMINI_MODELS` override. Its
fallback contained only `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, and
`gemini-3.1-pro-preview`. `/v1/chat` rejects models outside this list before
contacting Google. The OpenRouter environment already included
`google/gemini-3.8-flash`; that does not enable the Google route.

Using the live Gemini credential inside the relay host, the Google metadata
request for `models/gemini-3.8-flash` returned HTTP 200 and advertised
`generateContent`. No credential was printed or copied out of the host.

## Production repair performed

Added the dedicated systemd override
`/etc/systemd/system/bao-backend.service.d/96-yorubay-gemini-models.conf`:

```ini
[Service]
Environment="GEMINI_MODELS=gemini-3-flash-preview,gemini-3.1-flash-lite,gemini-3.1-pro-preview,gemini-3.8-flash"
```

Existing defaults were preserved. The operation refused to overwrite an
existing dedicated override, verified model identifier syntax, and included
rollback on restart/health/process-environment verification failure. It did
not modify the Python source, provider keys, OpenRouter list, or story saves.
`systemctl daemon-reload` and restart completed; the service was active,
`http://127.0.0.1:8080/health` returned HTTP 200, and the live process contained
the expected four-model list.

## Actual generation verification

A single authenticated request through the live relay's `/v1/chat`, provider
`gemini`, model `gemini-3.8-flash`, asked for the word OK. The relay returned
HTTP 200, `finishReason=STOP`, and two visible text characters. Google usage
reported 8 prompt tokens, 1 candidate token, 72 thought tokens, 81 total.
No player account request or wallet ledger was used.

SSM operation references:

- Apply: `3c57d1b9-b2e2-4bfb-b1f0-56665757b696`
- Generation probe: `7454cd9a-c44a-4156-b1b3-c11262a1c3a4`

This verifies the AWS Relay-to-Google generation path. It does not constitute
a signed-in player UI/Cloudflare/wallet end-to-end test, a long-context
summary/state rebuild test, or proof that Gemini will accept any story content.

## Follow-up operation boundary

The existing coordinated registry sync manages `OPENROUTER_MODELS` only;
it must not be described as synchronizing Gemini. The new process audit can
observe `GEMINI_MODELS`, but does not automatically deploy it. Future Google
model additions must review this independent list and verify the upstream
model before rollout. Removing the dedicated override restores the previous
source defaults after daemon-reload and restart; those defaults omit 3.8.
