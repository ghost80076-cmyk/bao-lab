# YoruBay AI Director Experiment

Status: experiment only; no production runtime behavior changed by this document.

## Product definition — do not drift from this

**AI Director is not a plot generator and not a per-turn event generator.**

It is a backstage narrative-judgment layer operating on top of YoruBay's continuously simulated world. Its job is to use the work's stable directing preferences together with actual world state to manage:

- pacing and dramatic pressure;
- off-screen NPC/world progression;
- unresolved threads and foreshadowing;
- event maturity/readiness;
- when hidden developments may become observable;
- when the best decision is to leave the scene alone.

The world does not exist to entertain the player every turn. NPCs may act off-screen, plans may advance without the player, opportunities may expire, and events may remain hidden until a valid information channel exists.

**"Nothing should happen yet" is a first-class Director decision.** Quiet turns, recovery, waiting, ordinary life, travel, and unresolved tension are valid states. The Director must never create an incident merely because a turn feels quiet.

The Director does not write the final RP prose. It does not become a character. It does not decide what the player thinks, says, feels, or does. It does not make its previous plan a command. The newest player action and established world causality may invalidate any previous Director suggestion.

A concise product rule:

> The world keeps living. The Director watches what is actually happening, applies this work's directing grammar, and decides what should keep developing, what is mature enough to surface, and what should remain quiet or hidden. The RP model performs only what is valid now.

## Goal

Build a YoruBay-native narrative control layer without turning YoruBay into a general-purpose agent runtime.

The design separates four concepts that must not be mixed together:

1. **Writing Style Pack** — how the prose is written.
2. **Director Style** — how this work tends to develop dramatically.
3. **Director Judge Template** — what signals matter when deciding whether/how the world should move.
4. **Director State** — the compact, dynamic judgment produced after the current turn for use on the next turn.

The director never controls the player, never becomes an NPC, and never receives secrets or tool execution authority.

## Core rule

> Writing Style decides how to write. Director Style decides how the story tends to move. The Judge Template decides what to pay attention to. Director State records what is currently brewing.

World state and causality always constrain the director. A director suggestion is not permission to violate player agency, NPC knowledge boundaries, or established facts.

### Authority order

When guidance conflicts, use this order:

1. player agency and newest explicit player action;
2. established facts, physical/causal world logic, time and state;
3. character cognition and information boundaries;
4. NPC autonomy and existing motivations;
5. Director State from the previous post-turn judgment;
6. Director Style preferences;
7. Writing Style presentation preferences.

Director guidance may shape possibilities inside the world; it may not rewrite the world to satisfy itself.

## Turn timing: judge after the turn, use on the next turn

The first experiment does **not** require a Director call before the main RP call.

Instead:

```text
Turn N input
  -> main RP output
  -> existing post-turn world-state update
       -> new World State
       -> new Director State N
  -> persist both

Turn N+1 context
  -> stable rules / card / Director Style / Writing Style
  -> World State
  -> relevant context
  -> Director State N
  -> recent chat
  -> newest player input
  -> main RP output
```

This means Director State is a **next-turn plan/pressure snapshot**, not a same-turn pre-generation plan.

A new player input may invalidate the previous suggestion. The RP model must re-check it against the newest input and current causality instead of forcing it.

## Cache placement

### Stable / cache-friendly

- YoruBay global RP rules
- card/world/character definition
- Director Style
- Writing Style Pack

### Dynamic / after the stable prefix

- memory/world state
- relevant context
- previous Director State
- recent chat
- newest player input

Do not put per-turn Director State inside the stable prefix. Director Style and Writing Style are independent stable controls.

## Writing Style Pack: HOW to write

Writing Style must only control prose presentation, for example:

- sentence rhythm and density;
- dialogue/narration balance;
- concrete vs lyrical description;
- viewpoint presentation;
- amount of sensory detail;
- formatting conventions.

It must not decide plot events, force relationship progression, schedule NPC actions, or create dramatic incidents.

Example:

```json
{
  "id": "cinematic_realism",
  "label": "電影感寫實",
  "traits": [
    "concrete action and sensory detail",
    "natural dialogue",
    "limited abstract emotion labels",
    "restrained metaphor"
  ]
}
```

## Director Style: HOW the story tends to move

Director Style is stable creative guidance. It should describe dramatic grammar rather than prose style.

Example:

```json
{
  "id": "k_romance_slowburn",
  "label": "韓式慢熱戀愛",
  "pacing": ["slow burn", "earned escalation", "room for silence"],
  "event_preferences": [
    "daily-life intersections",
    "relationship pressure",
    "missed timing",
    "social or work complications"
  ],
  "avoid": [
    "forced confession",
    "random catastrophe for drama",
    "convenient coincidence without setup",
    "player mind-reading"
  ]
}
```

Director Style must not contain prose instructions such as "use poetic sentences" or "describe eye contact in detail". Those belong to Writing Style.

## Director Judge Templates: WHAT to evaluate

The judge template changes the decision priorities without changing prose style. First experiment ships six conceptual templates.

### 1. General

For works that do not fit a specialized mode.

Priorities:
- unresolved threads;
- current world pressure;
- stagnation;
- plausible NPC initiative;
- cooldown after major events.

### 2. Character / Romance

Priorities:
- relationship pressure and accumulated interaction;
- unspoken needs/conflicts;
- social/work/family intersections;
- timing of relationship breakthroughs;
- NPC initiative that remains in-character.

Guardrails:
- no sudden confession without buildup;
- no forced coincidence merely to create romance;
- quiet daily-life turns are valid;
- relationship progress is not mandatory every turn.

### 3. TRPG / Sandbox

Priorities:
- world clock;
- NPC off-screen actions;
- quest deadlines and scheduled events;
- faction/resource changes;
- consequences of player absence or delay.

Guardrails:
- the world may move without the player;
- off-screen events do not automatically become player knowledge;
- do not manufacture encounters just because the player is idle.

### 4. Intrigue / Faction Competition

Priorities:
- actor goals and incentives;
- information asymmetry;
- alliances, negotiations, leverage and resources;
- reaction chains between factions;
- plans advancing while the player is elsewhere.

Guardrails:
- preserve knowledge boundaries;
- actors need plausible motives/resources;
- hidden plans surface only through observable consequences or valid information channels.

### 5. Survival / Adventure

Priorities:
- environment and travel;
- resources and scarcity;
- wounds/fatigue/conditions;
- weather and hazards;
- hostile actors and changing terrain.

Guardrails:
- danger should arise from established conditions;
- no arbitrary punishment to maintain excitement;
- recovery and quiet travel are valid states.

### 6. Mystery / Horror

Priorities:
- clue state;
- threat progression;
- unresolved anomalies;
- foreshadowing;
- reveal timing and information boundaries.

Guardrails:
- do not reveal the answer because the director knows it;
- advance hidden threats without leaking hidden state;
- prefer observable traces before exposition;
- quiet unease is valid; a scare is not required every turn.

## Optional author tuning

Templates may later expose simple creator-facing sliders instead of raw prompt editing. Example dimensions:

- event initiative;
- NPC off-screen activity;
- world autonomy;
- relationship progression speed;
- conflict intensity;
- daily-life / quiet-turn tolerance;
- random-event tolerance.

The UI should translate these controls into bounded configuration. Authors should not need to edit Director State JSON or internal prompts.

## Director State schema

The existing post-turn world-state processing is the preferred place to generate this compact block.

```json
{
  "schema_version": 1,
  "judge_template": "romance",
  "temperature": 0,
  "pace": "quiet|building|active|climax|cooldown",
  "stagnation": 0,
  "active_threads": [],
  "offscreen_actions": [],
  "next_pressure": null,
  "candidate_event": null,
  "surface_condition": null,
  "surface_now": false,
  "cooldown": false
}
```

`temperature` and `stagnation` are bounded 0-100 narrative signals, not model-generation temperatures.

`candidate_event` may be `null`. "Nothing should happen yet" is a valid director decision.

`surface_condition` is preferred over unconditional event forcing. It can express conditions such as "surface this thread only if the player meets the mutual friend or another valid information channel appears".

Internal chain-of-thought/reasoning must not be stored or exposed. If diagnostics are needed, store only a short categorical reason code such as `quiet_turn`, `thread_ready`, `deadline`, or `cooldown`.

## Main-model handoff

Only the minimum useful result should be injected into the next turn.

Example:

```text
[WORLD DIRECTION — previous post-turn state]
Pace: building
Active thread: former partner has contacted a mutual friend.
Player knowledge: not known.
Surface condition: only through a plausible information channel.
Constraint: do not force a coincidence; newest player action and world causality take priority.
```

The handoff is guidance, not an instruction to force an event.

## Feature switch

The player-facing concept should begin simple:

- **AI Director: Off** — no Director State generation/injection.
- **AI Director: On** — use the work's Director Style + Judge Template and generate Director State during the normal post-turn state update when technically compatible.

A future independent real-time Director mode may be evaluated separately. Do not silently add a second model call under the ordinary On switch.

If a future mode requires an extra model call, the UI must clearly disclose the additional model usage/cost/latency before the player enables it.

## Single-call experiment

Prefer reusing the existing world-state-model call rather than adding a new call. Extend its structured result with an optional `director_state` block.

Pass only stable Director Style + Judge Template configuration into that state-update task, then persist the returned Director State for the following turn.

### Pass criteria

Test representative YoruBay works:

1. romance / slow burn;
2. TRPG / simulation;
3. faction or family competition;
4. open-world survival;
5. mystery / horror.

Score:
- world-state accuracy;
- character autonomy;
- causal consistency;
- off-screen world activity;
- pacing quality;
- quiet-turn quality;
- unwanted event forcing;
- player-agency violations;
- information leakage;
- added input/output tokens;
- latency;
- stable-prefix/cache impact.

Proceed to runtime implementation only if the combined state-update call improves world activity/pacing without materially degrading state accuracy, player agency, latency, or cache behavior.

If state quality degrades because the model is doing two jobs, keep world-state generation unchanged and test an **optional separate Director call** behind a feature flag. That separate call must remain explicit and opt-in rather than silently doubling every turn's calls.

## Security boundary

AI Director is **not an Agent**. It has no generic tool loop and no authority to execute model-proposed actions. Any future deterministic system action must be validated by YoruBay code against an explicit schema/allowlist; roleplay/card text is untrusted input.
