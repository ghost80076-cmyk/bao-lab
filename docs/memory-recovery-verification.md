# Automatic memory recovery: scope and verification

PR #885 implements recovery when a summary finishes with a token-limit reason. It does not prove the original player's provider-side cause or modify their local save remotely.

| Requirement | Implementation / evidence |
| --- | --- |
| Summary output allowance | `Chat.maybeSummarize` explicitly uses 8192; helper routing preserves the request value; hosted transport forwards `max_output_tokens`; Worker validates against 8192 and provider transport forwards the effective value. Added frontend and Gemini relay payload assertions. These mock transport tests do not prove a live provider honored the value. |
| Incremental backlog | Existing 24,000-character input budget ends on complete assistant turns. The new manual retry handles at most four batches with a story save after each successful advance. Hosted automatic compaction continues to use its bounded attempts; one click is not guaranteed to clear all backlog. |
| Truncation recovery | At most two retries halve the complete-turn source range. Blocks do not retry. No partial output is repaired or accepted. Exhaustion preserves old summary, cursor and history; cooldown remains active. |
| Existing-story action | Memory status offers retry; it calls automatic summarization and saves coverage, rather than creating manual notes. During cooldown it waits for eligibility. |
| Errors | Hosted overflow points to memory status and retry; successful summary with continued overflow suggests fixed-setting investigation. The existing truncated-output health message is retained. Fixed-setting attribution is not automatic. |

Follow-up verification fixes the two failing #885 checks: helper-context now distinguishes bounded truncation retries from forbidden JSON repair; frontend-extension-contract expects the updated bridge version while preserving load order checks. The new recovery regression is included in Core tests.

Validation: all 372 individual Node commands extracted from Core tests pass locally. Dedicated hosted/frontend and Gemini provider transport assertions pass. Desktop/mobile browser cases have been added to the existing browser workflow; local execution is blocked by the missing Chromium executable. No live paid call or player save was used, and no merge/deployment was performed.
