# YoruBay AI Director Experiment

Status: experiment only; no production runtime behavior changed by this document.

## Goal

Combine two director concepts without turning YoruBay into a general-purpose agent runtime:

1. **Director Profile** — the author's creative direction: genre grammar, pacing, event preferences, framing, tone, escalation style, and anti-patterns.
2. **World Director** — state-aware orchestration: decide what the world/NPCs naturally do next from current world state, relationships, time, unresolved threads, off-screen activity, and scheduled events.

The director never controls the player, never becomes an NPC, and never receives secrets or tool execution authority.

## Core rule

> The author defines how this story tends to move. The world state determines what is currently possible. The director selects a plausible next pressure/event. The RP model performs it.

## First experiment: reuse the existing world-state call

Prefer a single existing world-state-model call rather than adding a new model call. Extend its structured result with an optional `director_state` block.

Suggested shape:

```json
{
  "world_state": {},
  "director_state": {
    "schema_version": 1,
    "temperature": 0,
    "pace": "quiet|building|active|climax|cooldown",
    "stagnation": 0,
    "active_threads": [],
    "offscreen_actions": [],
    "candidate_event": null,
    "surface_now": false,
    "reason": ""
  }
}
```

`temperature` and `stagnation` are bounded 0-100 signals, not prose-generation temperatures.

### Director Profile input

A card may optionally provide a compact profile:

```json
{
  "mode": "custom",
  "identity": "Korean romantic drama director",
  "pacing": ["slow burn", "emotional restraint", "earned escalation"],
  "event_preferences": ["daily-life intersections", "misunderstandings", "relationship pressure"],
  "avoid": ["forced confession", "random catastrophe", "player mind-reading"]
}
```

This is creative guidance, not an executable prompt/tool capability.

## Decision boundaries

The World Director may:
- choose plausible off-screen NPC actions;
- advance unresolved world pressures;
- surface an already-supported event when timing is appropriate;
- recommend quiet/cooldown turns;
- respect scheduled events and world time;
- maintain active threads/foreshadowing.

The World Director must not:
- write the final RP prose;
- speak or decide for the player;
- invent knowledge an NPC could not possess;
- force an event merely because the story is quiet;
- access API keys, credentials, arbitrary files, HTTP tools, shell/code execution, or external agent tools;
- override card/world causality.

## Integration rule

The main RP context should receive only the minimum director result needed for the current turn. Internal reasoning/reason fields should not be exposed to players by default.

Example handoff:

```text
[WORLD DIRECTION]
Pace: building
Off-screen: Rival family messenger reached the younger brother.
Surface now: false
Constraint: do not reveal the contact to the player until an observable consequence exists.
```

## Modes (future, only after evaluation)

- **Off** — no independent director processing. Director Profile may remain ordinary card guidance.
- **Auto** — director processing only when existing state-update cadence or deterministic triggers require it.
- **Always** — independent director evaluation each turn; this may require an additional model call and must clearly disclose extra token/cost impact.

Do not ship Always mode until the single-call experiment is evaluated.

## Evaluation

Compare baseline vs single-call director on representative YoruBay cards:

1. romance / slow burn;
2. TRPG / simulation;
3. faction or family competition;
4. open-world survival.

Score:
- character autonomy;
- causal consistency;
- off-screen world activity;
- pacing quality;
- unwanted event forcing;
- player-agency violations;
- world-state accuracy;
- added input/output tokens;
- latency;
- cache-prefix impact.

### Pass criteria

Proceed to runtime implementation only if the single-call variant improves world activity/pacing without materially degrading state accuracy, player agency, latency, or cache behavior.

If state quality degrades because the model is doing two jobs, keep world-state generation unchanged and test an **optional separate Director call** behind a feature flag. That separate call must use a low-cost structured-output model by default and remain opt-in/Auto rather than silently doubling every turn's calls.

## Security boundary

AI Director is **not an Agent**. It has no generic tool loop and no authority to execute model-proposed actions. Any future deterministic system action must be validated by YoruBay code against an explicit schema/allowlist; roleplay/card text is untrusted input.
