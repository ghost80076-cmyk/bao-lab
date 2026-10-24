# Request execution ledger — 2026-10-25

## Behavior

The existing context inspector now includes an optional, memory-only execution ledger. A story turn groups advisor, story, commentary, observer, memory/format repair and state requests in actual execution order. Independent API tools receive their own record. Guards record observed skip reasons rather than inferring execution from enabled settings.

The ledger separates logical API requests from browser transport attempts and retries. Same-model state records a merged decision; invalid state appendices record the absence of an extra fallback call. A failed story marks downstream observer/commentary stages as not reached. Formatting repair is a distinct logical request. Provider-reported numeric token usage and hosted charged USD are shown only when supplied; missing values remain unknown.

Browser attempts do not establish the number of upstream model executions or billed operations. Hosted Worker internal retries are outside this ledger. Model compliance with instructions, arbitrary card scripts and all possible combinations remain outside the proof provided by this feature.

## Isolation

No prompt, response, key, full endpoint, error message, config reference or trace token is copied into public records. Internal bindings use weak identity tokens and bounded source fingerprints. Records are neither persisted nor added to story backups. Source edits, story switches and reset prevent stale records from appearing for the current story. Revision commits rebind only the matching revision token and unchanged prefix. Public snapshots are copies. Display metadata is escaped and bounded.

Optional hooks do not change provider payloads, retry policy or callback semantics. API transport/decision observers swallow diagnostic errors. The loader installs the turn scope after existing control, interpretation and commentary wrappers.

## Validation

Local: 20 targeted Node suites passed, covering exact OpenAI/Anthropic/Gemini bodies before/after instrumentation, retry callbacks and counts, abort and streaming, failures before transport, metadata privacy, immutable snapshots, source/reset/story isolation, optional observer failure, feature assembly, preference lifecycle, state scheduling/concurrency, same-model merge, post-turn modules, context inspector/revision, cache, usage and local/hosted transport regression.

Browser CI extends the existing auxiliary contract suite: all eight advisor/observer/commentary combinations, each failure stage, preview/no-key zero calls, separate memory/state routes and interval, same-model state, read-only existing inspector at 320/390/1440px, HTTP retry versus format repair, invalid memory and cooldown. Completion is determined by the PR checks, not by this document alone.
