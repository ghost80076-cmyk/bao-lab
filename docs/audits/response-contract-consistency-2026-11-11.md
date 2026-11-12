# Response contract consistency — 2026-11-11

Baseline: main a7dbbb29bf8313ced7236502ab244808bf44966e (#950).

## Findings and changes

- P1: BYOK adapters substituted UI messages for empty model content, allowing the story caller to commit a synthetic assistant turn. All three adapters now reject empty/whitespace-only visible output in both JSON and SSE responses. Errors retain usage, finish/block reasons and sanitized safety metadata, without copying response text. Policy blocks retain BAO_PROVIDER_BLOCKED; other empty responses use BAO_PROVIDER_EMPTY. Readable partial output still follows existing completion/state rules.
- P2: Gemini direct memory requests included JSON MIME/schema constraints which hosted requests discarded. The same frontend builder now supplies both routes. Both Worker settlement paths validate optional response_format before reservation and forward it to the Gemini relay payload. Validation bounds the JSON object to 16 KiB and depth 20; unknown format envelope keys are rejected. Missing fields retain legacy behavior. Explicit schema=false means JSON MIME without a schema, as on the existing direct route.

## Connected domains and verification

API failure tests exercise the real App.sendMessage caller with mocked DOM/network: original history remains intact, player input is restored, and no world event, save or memory callback runs. SSE tests cover completed-but-empty outputs and preserved block diagnostics. Hosted tests compare the actual direct adapter, client serialization, Worker validator and provider transport payload. Settlement tests reject invalid formats before database operations. The impact gate includes these contracts as well as existing policy, memory guard, lifecycle and wallet checks.

This changes transport behavior for stories, revisions and auxiliary tools, and Gemini memory formatting for summary/Canon/Context Pack. No storage schema, author content, wallet pricing or UI layout changes. Script versions are advanced for cache delivery. Existing saves are preserved; already saved synthetic messages are not rewritten.

## Release and rollback

Pages and Worker both need deployment; deploy Worker first. An old client omits the new optional field and remains compatible. An old Worker ignores the field, so frontend-only deployment does not complete the format fix. No database migration or AWS code change is included. Tests inspect the outgoing AWS relay payload; live relay forwarding, paid providers and production settlement remain unverified and require release smoke checks.

Revert this change and redeploy Pages/Worker to roll back. No save or wallet data migration needs reversal. A rollback of the empty-output guard reintroduces the original failure behavior.
