# BAO/LAB five-player credit pilot

This is an **inactive** optional Worker. It does not change the existing BYOK site.
It uses one operator-owned OpenAI-compatible provider account. Verify that the provider permits the chosen model, Hong Kong end users, and this paid application before enabling it. Do not put secrets in GitHub.

## Accounting and privacy

One credit = one successful chat request, regardless of token length. Decide and publish the conversion from received USD to credits before accepting payment. Model cost varies with context length; the operator bears that variation. Requests are capped at 100 KB of messages, 80 messages, 2048 output tokens, and 200 calls per UTC day per player. A failed provider HTTP response refunds the credit. An ambiguous network or malformed success response retains the credit for manual reconciliation; review provider billing before refunding it. Concurrent balance reservations are conditional D1 updates. The ledger contains only identifiers, timestamps and credit movements; chats are forwarded in memory and are not inserted into D1. Cloudflare and the model provider still process requests.

## Setup

1. Create a D1 database named `bao-lab-credits-pilot` in your Cloudflare account and put its database ID in `wrangler.jsonc`.
2. From this directory, run `npx wrangler d1 execute bao-lab-credits-pilot --remote --file=schema.sql`.
3. Choose one vetted OpenAI-compatible provider and endpoint. Configure `UPSTREAM_URL` as a fixed full chat-completions URL (never accept it from a player). Set `MODEL_ID` to an allowed model. Use `npx wrangler secret put UPSTREAM_KEY` and `npx wrangler secret put ADMIN_TOKEN` for two distinct long random secrets. Set `ALLOWED_ORIGIN` to the exact site origin.
4. Run `npx wrangler deploy`. The web app does not offer this mode until a separate client integration is reviewed.
5. Admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`. POST `/admin/players` with `{"label":"player A"}` to create a player and receive a one-time login code. POST `/admin/topup` with `{"player_id":"...","credits":100,"reference":"unique-payment-id"}` after independently verifying payment. GET `/admin/players` lists balances. Keep the admin token and player login codes private.

For browser use, send `Authorization: Bearer <login_code>` from the approved origin to `GET /balance` or `POST /chat` with `{"messages":[{"role":"user","content":"..."}]}`. Do not send a player-supplied model or upstream URL. This first version is JSON only; browser streaming and integration with BAO/LAB's model selector remain follow-up work. Test with zero-value trial credits before accepting any payment.
