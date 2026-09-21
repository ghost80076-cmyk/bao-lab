# BAO/LAB Credits Worker — limited pilot

This is a separate Cloudflare Worker, NOT an update to the live GitHub Pages frontend. It uses the existing `bao-lab-credits-pilot` D1 database and its existing `players` and `api_usage` tables. The existing dashboard binding is called `資料庫` (the code also accepts `DB`). No migrations are required for this pilot.

**Status:** experimental, non-streaming text-only chat. Do not advertise paid credits or onboard paying players until you have verified pricing, provider terms, region eligibility, metering, and the refund/reconciliation process. A D1 binding and a GitHub commit alone do NOT deploy the Worker.

## 1. Configuration (keep keys out of GitHub)

In Cloudflare, open Workers & Pages → `bao-lab-credits-api` → Settings / Variables and Secrets. Add these as **encrypted secrets** (never paste them in GitHub or chat):

- `ADMIN_TOKEN`: a fresh, randomly generated, long private token for the owner only. It is different from players' tokens.
- `OPENROUTER_API_KEY`: your own OpenRouter API key if using OpenRouter.
- `GEMINI_API_KEY`: your own official Gemini API key if using the Gemini direct endpoint.

Add these as ordinary environment variables (not credentials):

- `ALLOWED_ORIGIN`: the exact origin of the BAO/LAB site, e.g. `https://example.com` (no trailing slash; comma-separated origins if needed). Requests with another browser Origin are denied. Requests without an Origin, e.g. from curl, still require authentication.
- `MODELS_JSON`: a JSON array of **explicitly allowed** model IDs and their current input/output prices. Configure only models you have checked against your own provider account; do not copy illustrative prices. Shape:

```json
[
  {
    "provider": "openrouter",
    "model": "YOUR_ALLOWED_OPENROUTER_MODEL_ID",
    "input_microusd_per_million": 0,
    "output_microusd_per_million": 0
  },
  {
    "provider": "gemini",
    "model": "YOUR_ALLOWED_GEMINI_MODEL_ID",
    "input_microusd_per_million": 0,
    "output_microusd_per_million": 0
  }
]
```

Replace the placeholders and both zeroes with real prices **before** using a paid model. Amounts are integers: USD 1 per million tokens = 1,000,000 micro-USD per million tokens. Cloudflare dashboard may provide an editor for text variables. If `MODELS_JSON` is missing/invalid, chat fails closed (no model is allowed). Do not grant a player token until keys, prices, and restrictions have been tested. The backend does not automatically pull live prices or reconcile invoices. Some providers apply cache discounts, tiered input pricing, or different rates for thought tokens, which this pilot does not model precisely.

## 2. Deployment

The branch includes `src/index.js` and `wrangler.jsonc` matching the existing Worker name and D1 ID. To deploy with Wrangler on a trusted local computer:

```bash
cd credits-worker
npx wrangler login
npx wrangler deploy
```

Alternatively, paste the complete contents of `credits-worker/src/index.js` into Cloudflare's **Edit code** for `bao-lab-credits-api` and click **Deploy**. This retains the current dashboard D1 binding; confirm the deployed Worker still has the `資料庫` binding and secrets. No API keys belong in source. Do **not** connect the root GitHub Pages project to Cloudflare Workers as if it were a standalone Worker. After deployment, visit `/health` and expect JSON `{ "ok": true, ... }`; that checks D1 table access, not provider connectivity.

`wrangler.jsonc` contains the D1 UUID shown in your Cloudflare dashboard. It is an identifier, not an API key. If your dashboard lists a different D1 ID, update it before deploying. Using Wrangler config as source-of-truth may reconcile dashboard bindings on the next deploy.

## 3. Admin actions (server-side or terminal only)

All administrative requests require `Authorization: Bearer <ADMIN_TOKEN>`. Never store the admin token in the BAO/LAB frontend or expose it to players. Endpoints:

- `POST /admin/players` with `{"balance_microusd":1000000,"daily_chat_limit":200}` creates a player. **The returned `player_token` is shown only once**; save it securely and give each player only their own token. `1,000,000` micro-USD = USD 1 of estimated credit (not a payment receipt).
- `GET /admin/players` lists IDs, balances and limits without returning tokens.
- `POST /admin/players/<uuid>/credit` with `{"amount_microusd":1000000}` adds manually reconciled credit.
- `POST /admin/players/<uuid>/disable` immediately blocks that token from making *new* requests (does not cancel an in-flight request).
- `GET /admin/usage?player_id=<uuid>` returns the latest 100 metadata-only usage records.

## 4. Player actions

Use `Authorization: Bearer <player_token>` on every request.

`GET /me` shows the player's own ID, balance, UTC chat count, and daily chat limit.

`POST /chat` accepts:

```json
{
  "provider": "openrouter",
  "model": "YOUR_ALLOWED_OPENROUTER_MODEL_ID",
  "request_kind": "chat",
  "messages": [{"role":"user","content":"Hello"}],
  "max_output_tokens": 1024
}
```

`provider` is `openrouter` or `gemini`; `model` must exactly match `MODELS_JSON`; `request_kind` can be `chat`, `status`, or `summary`. Successful responses contain `content` and usage. Streaming, image inputs, tool calls, file uploads, OpenAI-compatible proxy endpoints, and automatic frontend integration are **not included**.

## 5. Limits, accounting and privacy

Each player has a separate token hash, balance, and usage metadata. `chat` has a per-player daily limit (default 200 in **UTC**, not Hong Kong/Taiwan midnight). `status` and `summary` do not consume those 200 chats; they each have a separate 50/day safety cap and **still cost credits**. Input is limited to 24 KB of text messages; max output is 4096 tokens. An estimated upper amount is reserved before calling the model; unused credit is returned after verified usage. If a successful provider response lacks usage data, the reserve is kept and flagged `unverified` for manual reconciliation. If the measured charge is more than reserve, the player is charged no more than reserve; the operator covers the difference. Failed provider calls usually refund the reserve, but some providers may charge for failed/timed-out requests. Reconcile against provider invoices and set provider-side spending limits.

This Worker does **not** store message text, AI responses, or API keys in D1. It stores player ID, provider, model, purpose, tokens, estimated charged credit, status and UTC timestamp. The model providers receive prompt data for generation. A backend operator could change the Worker to log or read plaintext requests in the future; make a clear privacy disclosure to players. Cloudflare/provider logs and their retention are separate; review their settings and terms. Any paid resale, invoicing or regional access requires independent checks, especially for Hong Kong users. Do not present this as a bypass of a provider's regional restrictions.

## 6. Test before letting players in

Run `node --test tests/*.test.mjs` with Node 22+. After deploying, verify `/health`, create one **test** player, give a small credit, confirm `/me`, send one short request to an explicitly allowed model, check `/admin/usage`, verify chat usage and balance change, and test zero balance and expired daily quota. Check that the BAO/LAB frontend still uses its previous BYOK pathway unless you explicitly add an opt-in relay mode later.
