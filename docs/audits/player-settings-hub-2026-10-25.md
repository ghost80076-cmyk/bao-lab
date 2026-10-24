# Player settings hub — 2026-10-25

The player-facing goal is checking whether selected features were applied at the intended assembly point. Raw prompt review and ordered transport diagnostics are internal audit concerns.

The story overview now mounts inside the existing searchable tool drawer. The story entry opens that section; the existing tools entry opens the catalog in the same overlay. Opening the overview from an already open drawer expands its section without adding a second dialog. Existing settings actions still invoke their original managers. Closing returns any live save-slot list to the sidebar.

Settings evidence remains based on the actual assembled request, with selection scope, superseded choices, changed settings and trigger conditions. The player sees a small recent-processing result and observed skip reasons. Exact request sequence, HTTP attempts, route/model details and billing diagnostics are no longer rendered there.

The old inspector entry routes to the same player settings section. The browser inspector no longer retains an extra copy of prompt message content, and does not render raw prompts, platform rules or source-decision titles. Contract tests continue to inspect intercepted provider bodies to verify feature assembly, order and unchanged payloads. Source/config isolation and revision binding remain in place.

This reduces convenient disclosure through normal UI; it is not a secrecy boundary for code or prompts assembled in a BYOK browser. The player's own selected model and their own settings remain visible in their normal settings screens.

Validation: targeted Node suites cover metadata-only capture, immutable snapshots, request/usage behavior, source decisions, revision binding, settings evidence and wrapper integration. Browser contracts verify 320/390/1440px, one overlay, correct existing settings navigation, no raw platform prompt in the DOM, and no extra API calls. Existing settings, request assembly, backup, timeline and tool suites remain required in CI.
