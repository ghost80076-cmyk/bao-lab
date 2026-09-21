# BAO/LAB five-player credit pilot

This is an **inactive** optional Worker. It does not change the existing BYOK site.
It supports fixed OpenRouter and official Gemini routes with separate server-side credentials. Gemini is disabled by default for the proposed Hong Kong pilot: Google AI Studio's published region list does not include Hong Kong, and its terms limit availability of API clients to available regions. Enabling it requires a valid provider path that permits those end users. Check OpenRouter model/provider conditions before charging players. Do not put secrets in GitHub.

## Accounting and privacy

One credit = one successful chat request, regardless of token length. Decide and publish the conversion from received USD to credits before accepting payment. Model cost varies with context length; the operator bears that variation. Requests are capped at 100 KB of messages, 80 messages, 2048 output tokens, and 200 calls per UTC day per player. A failed provider HTTP response refunds the credit. An ambiguous network or malformed success response retains the credit for manual reconciliation; review provider billing before refunding it. Concurrent balance reservations are conditional D1 updates. The ledger contains only identifiers, timestamps and credit movements; chats are forwarded in memory and are not inserted into D1. Cloudflare and the model provider still process requests.

## Setup

1. Create a D1 database named `bao-lab-credits-pilot` in your Cloudflare account and put its database ID in `wrangler.jsonc`.
2. From this directory, run `npx wrangler d1 execute bao-lab-credits-pilot --remote --file=schema.sql`.
3. Set `OPENROUTER_MODEL` to one reviewed model and configure `npx wrangler secret put OPENROUTER_API_KEY`. Set `GEMINI_MODEL` and configure `npx wrangler secret put GEMINI_API_KEY` only if an allowed route is confirmed. Keep `ENABLE_GEMINI` set to `false` for Hong Kong players under the current Google AI Studio terms. Configure `npx wrangler secret put ADMIN_TOKEN` with a distinct long random secret. Set `ALLOWED_ORIGIN` to the exact site origin.
4. Run `npx wrangler deploy`. The web app does not offer this mode until a separate client integration is reviewed.
5. Admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`. POST `/admin/players` with `{"label":"player A"}` to create a player and receive a one-time login code. POST `/admin/topup` with `{"player_id":"...","credits":100,"reference":"unique-payment-id"}` after independently verifying payment. GET `/admin/players` lists balances. Keep the admin token and player login codes private.

For browser use, send `Authorization: Bearer <login_code>` from the approved origin to `GET /balance` or `POST /chat` with `{"provider":"openrouter","messages":[{"role":"user","content":"..."}]}`. The player may select a configured provider, but cannot send a model, endpoint, or API key. Official Gemini is gated off by default. This first version is JSON only; browser streaming and integration with BAO/LAB's model selector remain follow-up work. Test with zero-value trial credits before accepting any payment.
