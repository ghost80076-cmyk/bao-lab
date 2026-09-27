# BAO Doctor v1

BAO Doctor v1 is the first author-facing diagnostic layer for BAO/LAB.

## Scope

v1 analyzes the current role card only. It reuses the existing character readiness rules, then attributes actionable findings to six layers:

1. structure and required fields
2. character core and opening
3. world and NPC rules
4. long-play progression
5. presentation and author control
6. runtime / memory / context

The sixth layer is deliberately marked **not tested** in v1. Static role-card inspection cannot prove whether an actual story lost memory, omitted relevant context, failed a state patch, or was ignored by a model.

## Product rule

Do not respond to every symptom by adding more prompt text.

The doctor should answer, in order:

- which layer contains evidence of a problem;
- what evidence supports that diagnosis;
- whether the problem is a card-authoring issue or still untested runtime behavior;
- the smallest next repair;
- what should not be changed without play-test evidence.

A card that is already ready for long-form testing should be played for roughly 10–20 turns before more settings are added.

## v1 integration

The Character Studio exposes its current normalized card through `window.BAOCharacterStudio.readCard()`.

`js/bao-doctor.js` reads that card and the existing `BAOCharacterReadiness.audit` result. The Character Studio button opens a local report; it does not call an AI provider and does not require an API key.

## Follow-up direction

A later Runtime Doctor can accept evidence from an active story:

- memory summary / long-term notes
- the actual relevant context sent to the model
- world and character state before/after a turn
- state patch parse failures
- model response and provider metadata

Only after those signals exist should BAO classify a symptom as memory, context, state, provider/model, or card-authoring failure.
