# YoruBay model registry / pricing maintenance — 2026-11-26

## Purpose
Bring official BYOK and OpenRouter BYOK model presets up to date without breaking saved story model IDs. Add only selected new models to the hosted (夜灣燈火) candidate registry. **This PR is not a production deployment, and does not prove provider connectivity or billable settlement.**

## New routes
11 logical models: Gemini 4 Hydrogen, Neon, Carbon, Argon; Claude Haiku 5.5 and Fable 5.2; GPT-6 Luna, GPT-6.1 Terra, GPT-6.2 Sol and GPT-6.2 Astra; DeepSeek V4.1 Flash 1017.

New hosted candidates (all via OpenRouter with independent Worker allowlist and AWS relay sync required):
- `deepseek/deepseek-v4.1-flash-1017`
- `google/gemini-4-hydrogen`
- `google/gemini-4-neon`
- `openai/gpt-6-luna`
- `openai/gpt-6.2-sol`

BYOK-only new routes: Gemini 4 Carbon / Argon (scheduled price change), Claude Haiku 5.5 (100K+ tier), Claude Fable 5.2 (high cost), GPT-6.1 Terra and GPT-6.2 Astra (unverified high-context/provider behavior).

## Existing models and pricing
- Claude Sonnet 4.5 has an Anthropic official API retirement date of 2026-11-30. Its ID and hosted entry stay for legacy stories; the catalog warns against new selection. OpenRouter availability is separately governed and not assumed after retirement.
- The legacy official `deepseek-v4-flash` is mapped by upstream to DeepSeek V4.1 Flash 1017. New stories should use `deepseek-flash`. OpenRouter's previous `deepseek/deepseek-v4-flash-0731` remains a separate legacy snapshot and MUST NOT be silently remapped.
- GPT-5.6 Luna hosted OpenRouter has >272K tiered input/output/cache/price guard; the versioned rollout is updated to match.
- Gemini 4 Carbon and Argon's promotional prices change on 2026-12-01. Prices intentionally aren't hard-coded in the preset; hosted is disabled.
- Gemini 3.8 Flash promo is scheduled to end 2026-12-31; update Worker and OpenRouter ceilings before the price change or requests may fail closed. No automatic price hike is applied in this PR.

## Release blockers / acceptance
1. All registry, rollout, hosted selector, Worker billing and cross-feature regression checks must be green.
2. Verify actual Google Gemini 4 official serialization: `thinking_level` rather than legacy `thinking_budget`, implicit caching only; memory and state routes.
3. Verify GPT-6.2 Sol reasoning parameters; `reasoning_effort:none` is unsupported. Verify >272K actual price tiers.
4. Verify Claude Haiku 5.5 long context / cache-writing prices before adding hosted.
5. Verify provider-specific OpenRouter hard-ceiling behavior and paid real request cost; provider base charges may differ from reference values.
6. Hosted production requires separate coordinated dry-run/apply of AWS + Cloudflare and re-audits. Existing GLM-5.2 Worker/AWS production sync remains pending; don't declare it live solely from frontend PR merge.
7. Do not delete story saves, rewrite existing API keys, or merge retired IDs into new models.

## Sources
- https://ai.google.dev/gemini-api/docs/pricing
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://platform.claude.com/docs/en/models/haiku-5-5/overview
- https://developers.openai.com/api/docs/pricing
- https://api-docs.deepseek.com/quick_start/pricing/
- https://openrouter.ai/models
- docs/model-deployment-sync.md
