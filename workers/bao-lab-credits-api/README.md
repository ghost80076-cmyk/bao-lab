# YoruBay / BAO LAB credits Worker

This directory is the version-controlled backup/reference for the production Cloudflare Worker behind `bao-lab-credits-api`.

## Production hotfix snapshot — 2026-09-26

The checked-in `worker.js` is reconstructed from the saved **YoruBay_Worker_v6.2.js** source plus the production fixes verified on 2026-09-26:

- Cloudflare upstream timeout: **75 seconds**
- AWS relay application timeout: **65 seconds**
- Gunicorn timeout on EC2: **90 seconds**
- Provider/relay network ambiguity is recorded as `unverified_refunded` and the player's cost-USD reservation is returned immediately
- successful OpenRouter responses with incomplete usage metadata attempt `/api/v1/generation` recovery by generation ID before settlement
- if successful content still cannot be verified, the content is delivered and the reservation is refunded instead of returning a paid 502
- explicit provider failures continue through the existing `failed` + refund path
- successful verified requests still settle from actual token usage

The AWS Gunicorn 90-second value is a runtime/systemd setting and is documented here; it is not configured by this Worker source.

## Production deployment rule

Changes to the production Worker paths are automatically deployed after they are merged to `main`. The guarded workflow validates the Worker boundary, replaces only the script content and runs the production security audit afterward. Manual dispatch remains available as a fallback.

Do not commit Cloudflare/AWS secrets. Keep `ADMIN_TOKEN`, `BAO_INTERNAL_TOKEN`, provider API keys, and other credentials in their platform secret stores.

### Guarded content-only deployment

The GitHub Actions workflow `Deploy production Worker` replaces only
the production Worker's module content through Cloudflare's content endpoint.
That endpoint does not change Worker configuration or metadata, so the D1
database, rate limiter, variables, secrets, routes and observability settings
remain attached.

The first supervised credentialed deployment has passed. The workflow now runs
automatically when a watched Worker path changes on `main`, and can still be
started manually. These GitHub Actions repository secrets are required:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` scoped to this account with Workers Scripts Write
- `CLOUDFLARE_WORKER_NAME` (`bao-lab-credits-api` for the current Worker script)

The path filter deliberately excludes frontend-only changes. The deployment
packager loads the versioned `deployment-manifest.json`, rejects unsafe or
missing module paths and uploads the listed JavaScript module graph in a
deterministic order. The reviewed module graph now extracts `WorkerAccountRateLimit`,
`WorkerAccountValidation`, `WorkerChatInput`, the isolated `WorkerAdminAuth`
boundary, `WorkerAdminPlayerDirectoryRoutes`, `WorkerAdminPublicationRoutes`,
`WorkerAdminUsageRoutes`, `WorkerAuthorOwnership`, `WorkerAuthorProfilePublication`, `WorkerPublicationFormat`,
`WorkerGithubPublicationTransport`, `WorkerRuntimeConfig`, `WorkerCrypto` and
`WorkerHttp` into reviewed modules; the main entry remains `worker.js`. The first
multi-module deployment completed a successful rollback-and-restore rehearsal
on 2026-10-04. Continue structural cleanup one low-dependency boundary per PR.
Follow
[`docs/worker-production-rollback.md`](../../docs/worker-production-rollback.md)
if a deployed Worker change must be reverted.

## Account authentication rate limiting

The Worker can protect registration, login and account recovery through an optional Cloudflare Rate Limiting binding named `AUTH_RATE_LIMITER`.

The production Worker is currently dashboard-managed, but Cloudflare's Rate
Limiting API binding is configured through Wrangler 4.36 or later. Add a
dedicated namespace to the deployment configuration; choose a positive integer
that is not shared with an unrelated limiter in the same Cloudflare account:

```jsonc
{
  "ratelimits": [
    {
      "name": "AUTH_RATE_LIMITER",
      "namespace_id": "1001",
      "simple": {
        "limit": 10,
        "period": 60
      }
    }
  ]
}
```

The starting policy is 10 attempts per 60 seconds per key. The Worker uses
separate action keys and hashes usernames, public player IDs and registration
network identifiers before calling the binding. Cloudflare currently does not
show Rate Limiting bindings in the dashboard, so `/health`, the production
audit and Worker logs are the verification surfaces.

- Login is keyed by normalized username.
- Recovery is keyed by normalized public player ID.
- Registration checks both normalized username and `CF-Connecting-IP` when Cloudflare provides it.
- Binding errors fail open by default to preserve account availability. Set `AUTH_RATE_LIMIT_FAIL_CLOSED=1` only if blocking all account entry during a rate-limiter outage is the intended policy.
- `GET /health` reports `auth_rate_limit_configured`; verify it is `true` after the production binding and Worker source are deployed.

Without the binding, the code remains compatible with the existing deployment and does not claim that rate limiting is active.

Because public registration is enabled, production acceptance requires both
`auth_rate_limit_configured` and `public_registration_protected` to be `true`.
After binding and deploying the reviewed Worker source, run:

```bash
npm run audit:production-security
```

The audit also verifies the deployed security contract version, credentialed
CORS, HSTS, response hardening headers, blocked foreign origins and preflight
behavior. Cookie-authenticated state changes require a configured allowed
`Origin`; Bearer clients remain available without a browser Origin header.

## Verification performed

After the production hotfix, D1 showed normal `ok` settlement with exact wallet arithmetic, including:

- Gemini 3.1 Flash-Lite: `994423 - 1305 = 993118`
- Gemini 3.1 Pro: `3994510 - 52104 = 3942406`

`unverified_refunded` is the auditable fallback for ambiguous transport/usage outcomes. It must not leave a player's reservation held; inspect these rows through D1 when they occur.


## Selected-player OpenRouter AWS routing

The Worker supports an optional comma-separated environment variable:

`AWS_OPENROUTER_PLAYERS`

Entries may be a player's internal `id`, stable `public_id`, or `username` (matching is case-insensitive).

When a matched player requests an allowed `openrouter` model, the Worker sends the request to the existing AWS relay at `AWS_RELAY_URL/v1/chat` using `BAO_INTERNAL_TOKEN`. The relay is expected to accept:

```json
{
  "provider": "openrouter",
  "model": "google/gemini-3.1-pro-preview",
  "messages": [{"role":"user","content":"..."}],
  "max_output_tokens": 2048
}
```

Unmatched players continue to call OpenRouter directly from the Worker with `OPENROUTER_API_KEY`.

This switch is server-side only: the browser cannot choose the route. Model allowlisting and Wallet settlement remain in the Worker, and the AWS relay returns the raw OpenRouter response so existing `usage.cost` settlement continues to work.


## OpenRouter free-model Wallet behavior

The cost-USD billing path supports zero-priced models. When a model is configured with zero input/output rates and OpenRouter reports `usage.cost = 0`:

- the Worker creates the usage record but reserves **$0** from the player's Wallet;
- a successful request settles at **$0** and leaves the Wallet balance unchanged;
- the player still needs an enabled YoruBay Wallet/account;
- if the upstream unexpectedly reports a non-zero `usage.cost`, the existing actual-cost settlement path applies instead of silently treating it as free.

Example `MODELS_JSON` entry for the OpenRouter free router:

```json
{
  "provider": "openrouter",
  "model": "openrouter/free",
  "input_microusd_per_million": 0,
  "output_microusd_per_million": 0,
  "cache_read_microusd_per_million": 0,
  "cache_write_microusd_per_million": 0
}
```

For players routed through the AWS OpenRouter relay, also add `openrouter/free` to the relay's `OPENROUTER_MODELS` allowlist before enabling the preset in production.


## Hosted model catalog rollout

The browser catalog and the two server allowlists must be updated together. A model is not production-ready until all three layers agree:

1. `js/credits-pilot.js` exposes the YoruBay hosted preset.
2. Cloudflare `MODELS_JSON` allows the same `provider + model` and has reviewed pricing.
3. AWS-relayed players have the same OpenRouter model in `OPENROUTER_MODELS`.

The prioritized September 2026 player-facing catalog adds these paid OpenRouter routes:

- `deepseek/deepseek-v4-flash-0731`
- `qwen/qwen3.7-flash`
- `xiaomi/mimo-v2.5`
- `minimax/minimax-m3`

Player-facing Google official routes are:

- `gemini-3-flash-preview`
- `gemini-3.1-pro-preview`

Player-facing OpenRouter high-end routes are:

- `anthropic/claude-sonnet-4.5`
- `anthropic/claude-sonnet-4.6`
- `anthropic/claude-opus-4.6`

The following previously exposed YoruBay Hosted presets are intentionally removed from the player-facing catalog:

- `openrouter/free` — reserved for a separate future Discord mascot/support-assistant backlog rather than normal RP usage
- `gemini-3.1-flash-lite`
- `google/gemini-3.1-pro-preview`
- `anthropic/claude-opus-4.5`

The Worker may retain compatibility code for some removed routes, but the browser must not advertise them as YoruBay Hosted choices.

For the current OpenRouter pricing snapshot already tracked in `data/presets/models.json`, the new Worker `MODELS_JSON` entries should use the same reviewed rates before rollout. Do not assume the browser labels are a billing source of truth; re-check OpenRouter pricing when production configuration changes.

Example AWS relay allowlist after the expansion:

```text
OPENROUTER_MODELS=deepseek/deepseek-v4-flash-0731,qwen/qwen3.7-flash,xiaomi/mimo-v2.5,minimax/minimax-m3,anthropic/claude-sonnet-4.5,anthropic/claude-sonnet-4.6,anthropic/claude-opus-4.6
```

`openrouter/free` is not part of the player-facing Hosted catalog in this rollout. Its existing Worker compatibility behavior can remain until the separate Discord-assistant design is implemented.

## OpenRouter cost guard and long-context pricing

YoruBay Hosted must not depend on an operator manually noticing every upstream price change.

The Worker now treats `MODELS_JSON` as both an allowlist and a **pre-request safety contract**:

1. estimate the request input before sending it;
2. choose the standard or configured long-context pricing tier;
3. reserve Wallet balance against the configured OpenRouter hard ceiling;
4. send OpenRouter `provider.max_price` so an unexpectedly expensive provider is rejected before inference;
5. settle the successful request from OpenRouter's returned `usage.cost`;
6. refund unused reservation when the real cost is lower.

OpenRouter documents `provider.max_price.prompt` and `provider.max_price.completion` in USD per 1M tokens. If all available providers exceed the ceiling, OpenRouter should fail the request instead of silently spending above the configured limit.

### MODELS_JSON fields

Existing fields remain valid:

```json
{
  "provider": "openrouter",
  "model": "example/model",
  "input_microusd_per_million": 100000,
  "output_microusd_per_million": 200000,
  "cache_read_microusd_per_million": 50000,
  "cache_write_microusd_per_million": 125000
}
```

Optional hard-ceiling fields:

```json
{
  "openrouter_max_prompt_microusd_per_million": 150000,
  "openrouter_max_completion_microusd_per_million": 300000
}
```

If these are omitted, the Worker uses the active configured input/output pricing rates as the OpenRouter `max_price` ceiling. This is intentionally fail-closed: a provider price increase may temporarily make the request unavailable, but should not silently turn into an owner-funded overage.

Optional long-context tier:

```json
{
  "long_context_threshold_tokens": 200000,
  "long_context_input_microusd_per_million": 200000,
  "long_context_output_microusd_per_million": 400000,
  "long_context_cache_read_microusd_per_million": 100000,
  "long_context_cache_write_microusd_per_million": 250000,
  "long_context_openrouter_max_prompt_microusd_per_million": 250000,
  "long_context_openrouter_max_completion_microusd_per_million": 500000
}
```

The threshold and tier values are per-model configuration. Do not assume every provider or model uses a 200K boundary.

The current YoruBay Hosted transport limits normalized prompt payloads to `MAX_PROMPT_BYTES = 192_000`, so a 200K-token tier is not normally reachable today. Tier support is retained so future context-window expansion cannot silently invalidate Wallet reservation logic.

### AWS relay requirement

Selected AWS-routed OpenRouter players must receive the same hard ceiling as direct Worker -> OpenRouter traffic.

The Worker now sends this extra field to `AWS_RELAY_URL/v1/chat`:

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4.6",
  "messages": [{"role":"user","content":"..."}],
  "max_output_tokens": 2048,
  "openrouter_provider": {
    "max_price": {
      "prompt": 3,
      "completion": 15
    }
  }
}
```

The EC2 relay must validate `openrouter_provider.max_price` as non-negative finite numbers and forward it to OpenRouter as the request body's `provider` object. Until the relay does this, AWS-routed OpenRouter requests do **not** have the upstream hard-price guarantee and PR #61 must remain Draft.

Do not accept arbitrary browser-supplied provider routing. The browser never sends this field; the Worker derives it from the server-side `MODELS_JSON` entry.


## Admin provider control

The authenticated `admin-wallet.html` page can manage two owner-side concerns without exposing them to players:

1. **Provider balance tracking** for `gemini` and `openrouter`.
   - OpenRouter stays on the USD anchor model: the admin enters the current official USD balance and low-balance threshold, and the Worker estimates remaining USD as `anchor balance - known upstream spend since the anchor`.
   - Google Gemini uses a native-currency snapshot instead. The admin records the official Google Billing balance exactly as shown in TWD, while YoruBay continues to record provider spend in USD.
   - Gemini's TWD balance and YoruBay's USD spend are deliberately displayed side by side rather than converted or subtracted. The Worker does not apply an implicit FX rate.
   - Provider spend follows known upstream cost first. If a provider reports a real cost for a request that YoruBay later refunds because usage could not be verified, that upstream cost is still tracked without charging the player again.
   - When no provider-reported cost is available, only settled `ok` / `over_budget` rows fall back to YoruBay's calculated cost.
   - These are internal snapshots/estimates, not live provider queries. External API-key usage, provider rounding, or missing upstream cost metadata can still create drift. Re-anchor or refresh the snapshot whenever the upstream account is topped up or manually adjusted.

2. **Hosted Gemini route overrides**.
   - `gemini-3-flash-preview` and `gemini-3.1-pro-preview` default to the existing Google Gemini route.
   - The admin can switch either logical model to its OpenRouter equivalent.
   - Players keep the same YoruBay model choice and story settings; the Worker resolves the actual upstream server-side.
   - If a saved override is no longer permitted by `MODELS_JSON`, the Worker falls back to the existing Google route instead of sending an unpriced request.

The control tables are created lazily after an authenticated admin request:

- `hosted_route_overrides`
- `provider_balance_anchors` (USD estimate providers such as OpenRouter)
- `provider_native_balance_snapshots` (native-currency snapshots such as Google Gemini TWD)

Admin endpoints:

- `GET /admin/provider-control`
- `POST /admin/provider-control/route`
- `POST /admin/provider-control/balance`

All three require `Authorization: Bearer <ADMIN_TOKEN>`.

### OpenRouter Gemini prerequisite

The OpenRouter route can only be selected when the Worker `MODELS_JSON` already contains a reviewed pricing entry for the matching provider/model pair:

```json
[
  {
    "provider": "openrouter",
    "model": "google/gemini-3-flash-preview"
  },
  {
    "provider": "openrouter",
    "model": "google/gemini-3.1-pro-preview"
  }
]
```

Real pricing fields must also be present in production. The admin page deliberately marks an unconfigured route unavailable rather than bypassing the server-side allowlist.

This control is separate from BYOK. A player using their own Google Gemini or OpenRouter API key continues to call their selected provider directly and is not affected by the YoruBay Hosted route override.

## Admin character publication

The existing `ADMIN_TOKEN` also protects the character publication endpoints:

- `GET /admin/characters/publish-status`
- `POST /admin/characters/publish-pr`

Publication is intentionally **pull-request only**. The Worker creates a new branch and GitHub PR; it never writes directly to `main`.

Community publication is stored for scale:

- character JSON: `data/characters/community/<hash-bucket>/<id>.json`
- cover: `assets/community/<hash-bucket>/<id>.<webp|png>`
- browse catalog: bounded 48-item pages under `data/character-catalog/community/`
- manifest: `data/character-catalog/community/manifest.json`

The browser loads only the newest community catalog page initially; older pages are fetched only when the player requests more works. Full character JSON is still fetched only when the player opens that work.

Required Worker secret:

- `GITHUB_TOKEN` — use a fine-grained GitHub personal access token scoped only to `ghost80076-cmyk/bao-lab`, with **Contents: Read and write** and **Pull requests: Read and write**.

Optional Worker variables:

- `GITHUB_REPO` — defaults to `ghost80076-cmyk/bao-lab`.
- `GITHUB_BASE_BRANCH` — defaults to `main`.

Do not put `GITHUB_TOKEN` in the browser, Pages environment, localStorage, or the admin HTML. The browser sends only the parsed publication payload through the existing admin Worker connection.

The endpoint requires explicit rights confirmation, rejects duplicate published IDs, strips `preserved_source`, redacts credential-like object fields, limits card/cover sizes, validates PNG/WebP signatures, and removes the temporary branch if PR creation fails. BAO-native `meta`, `content`, `gameplay`, and `presentation` extension fields are preserved so later platform features can evolve without republishing every card.



## 2026-10-02 staged mainstream Hosted rollout

This rollout adds four player-choice models without replacing the existing Hosted catalog:

- `anthropic/claude-haiku-4.5`
- `anthropic/claude-sonnet-5`
- `openai/gpt-5.6-luna`
- `x-ai/grok-4.5`

The reviewed Worker pricing delta is versioned at:

`workers/bao-lab-credits-api/model-rollouts/2026-10-02-mainstream-openrouter.json`

**Important:** that JSON file is a delta, not a complete replacement for production `MODELS_JSON`.
Append or merge those four objects into the existing Cloudflare `MODELS_JSON`; replacing the entire variable with only the delta would disable previously allowed models.

Generate a validated deployment plan from that delta instead of copying the Cloudflare and AWS values independently:

```bash
node workers/bao-lab-credits-api/build-model-rollout-plan.cjs \
  workers/bao-lab-credits-api/model-rollouts/2026-10-02-mainstream-openrouter.json
```

The JSON output contains:

- `cloudflare.value_json` for `MODELS_JSON_EXTRA`;
- `aws.append_csv` for the IDs to append to `OPENROUTER_MODELS`;
- `resolved_routes`, proving every delta entry resolves back to `data/presets/models.json`.

The tool deliberately does not merge or replace the unknown production base allowlist.

The four routes intentionally use OpenRouter for YoruBay Hosted so the existing Worker cost settlement and AWS relay path remain unchanged.

Pricing snapshot reviewed on 2026-10-02:

| Model | Input / MTok | Cache read / MTok | Cache write / MTok | Output / MTok |
| --- | ---: | ---: | ---: | ---: |
| Claude Haiku 4.5 | $1.00 | $0.10 | $1.25 | $5.00 |
| Claude Sonnet 5 | $2.00 | $0.20 | $2.50 | $10.00 |
| GPT-5.6 Luna (OpenRouter Standard) | $0.20 | $0.02 | $0.25 | $1.20 |
| Grok 4.5 | $2.00 | $0.30 | — | $6.00 |

Grok 4.5 has a higher-context tier above 200K tokens. The rollout config therefore records $4/M input, $0.60/M cache read, and $12/M output for that tier. Cache write is intentionally omitted so the Worker falls back conservatively to the active input rate.

Sources used for the reviewed pricing snapshot:

- https://openrouter.ai/anthropic/claude-haiku-4.5
- https://openrouter.ai/anthropic/claude-sonnet-5
- https://openrouter.ai/openai/gpt-5.6-luna
- https://docs.x.ai/developers/pricing

### Cloudflare rollout

Cloudflare currently limits each Worker environment variable value to 5 KB. The existing production `MODELS_JSON` is already close enough to that limit that appending four more full pricing objects can exceed the dashboard limit.

The Worker therefore supports a second allowlist/pricing shard:

- `MODELS_JSON` — keep the current production array unchanged.
- `MODELS_JSON_EXTRA` — put the four 2026-10-02 rollout objects here as a separate JSON array.

Before exposing the browser catalog:

1. deploy a Worker version that includes `MODELS_JSON_EXTRA` support;
2. leave the existing production `MODELS_JSON` unchanged;
3. create `MODELS_JSON_EXTRA` and paste the complete four-entry array from the rollout JSON;
4. deploy the Worker;
5. verify `/health` and one low-output test request for each new model.

If both variables are present, the Worker concatenates both arrays for allowlisting and pricing. A malformed extra shard is ignored without discarding the valid base shard.

The explicit `openrouter_max_*_microusd_per_million` fields are deliberate. If OpenRouter cannot serve a model at or below the reviewed ceiling, the request should fail closed instead of silently accepting a more expensive upstream.

### AWS relay rollout

For players routed through `AWS_OPENROUTER_PLAYERS`, append the same four model IDs to the existing EC2 `OPENROUTER_MODELS` environment variable:

```text
anthropic/claude-haiku-4.5
anthropic/claude-sonnet-5
openai/gpt-5.6-luna
x-ai/grok-4.5
```

Do not replace the current allowlist with only these four values. Keep every currently permitted production model and append the four new IDs.

After updating the EC2 environment, restart `bao-backend.service` and confirm `/health` before merging the player-facing catalog PR.

### Release gate

The player-facing catalog PR must stay unmerged until both server layers agree:

- Cloudflare `MODELS_JSON` contains all four reviewed entries.
- AWS `OPENROUTER_MODELS` contains all four IDs for AWS-routed players.

Only after both checks pass should the browser catalog be merged and deployed.


## Refactor safety map

The current Worker uses a reviewed module manifest and keeps all but the extracted account-rate-limit, account-validation, chat-input, admin-auth, admin-player-directory-routes, admin-publication-routes, admin-usage-routes, author-ownership, author-profile-publication, publication-format, GitHub-publication-transport, runtime-config, crypto and HTTP boundaries in `worker.js`. The responsibility boundaries and safe refactor order are documented in [`docs/worker-architecture-boundaries.md`](../../docs/worker-architecture-boundaries.md).
