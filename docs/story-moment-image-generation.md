# Story Moment Image Generation

## Goal

Add an image-generation capability to YoruBay that turns the current RP moment into a visual without asking players to manually write image prompts.

Product copy: **把故事的這一刻畫出來。**

This PR intentionally defines the product and integration contract first. It does **not** enable paid image generation in production yet.

## Product principles

1. **Story state first** — derive the visual request from the current story rather than exposing raw prompt engineering as the primary UX.
2. **Local-first** — generated-image metadata belongs to the local story. Do not silently upload story history or generated images to a YoruBay library.
3. **Minimum context** — never send the full RP transcript when a compact visual context is sufficient.
4. **BYOK first** — when a compatible player-owned provider/key is selected, use it directly and do not consume YoruBay 燈火.
5. **燈火 fallback** — hosted generation may use YoruBay's provider path and charge 燈火 from actual provider cost according to the billing configuration.
6. **No separate image currency** — image generation uses the same 燈火 concept as hosted text generation.
7. **Failure-safe billing** — reserve before hosted generation; settle only verified provider usage/cost; fully refund on failed or unverifiable generation.
8. **Provider-agnostic UI** — player chooses a quality tier/capability. Provider/model IDs remain implementation details unless advanced settings are opened.

## V1 user flow

Inside an active story, expose a secondary action:

> 畫出這一刻

Opening it shows a compact preview with:

- current scene / location
- visible characters
- viewpoint
- quality tier
- cost source: `自己的 API` or `夜灣燈火`

Suggested tiers:

- `快速` — lower-cost RP illustration
- `標準` — default
- `精緻` — higher-cost / higher-resolution model

The UI must show the estimated 燈火 charge **before** a hosted request is confirmed. Do not hard-code a universal per-image price in the frontend.

## Visual context contract

Build a compact `visual_context` from story state. It should contain only information useful to render the current moment:

```json
{
  "scene": {
    "location": "",
    "time": "",
    "weather": "",
    "lighting": "",
    "mood": ""
  },
  "characters": [
    {
      "id": "",
      "name": "",
      "adult_age": null,
      "appearance": "",
      "clothing": "",
      "pose_action": "",
      "expression": ""
    }
  ],
  "camera": {
    "viewpoint": "observer|player_pov|custom",
    "shot": "",
    "angle": "",
    "distance": ""
  },
  "continuity": {
    "stable_character_traits": [],
    "current_scene_facts": []
  }
}
```

Do not include unrelated long-term memory, hidden NPC thoughts, API keys, provider credentials, account/session secrets, or the complete transcript.

## Prompt compiler

The client/runtime should compile `visual_context` into the selected provider's request format. Keep provider syntax out of character cards.

Priority order:

1. explicit player visual instruction for this generation
2. current observable story state
3. stable character appearance / continuity facts
4. card artwork/style hints when available
5. safe defaults

The image request must not mutate canonical story state by itself. A generated image is a representation of the moment, not a new story event.

## Billing contract

### BYOK

Compatible player key -> provider image endpoint -> no YoruBay 燈火 charge.

### Hosted

YoruBay hosted route -> pricing config -> estimated cost -> reserve 燈火 -> provider call -> verified settlement.

Use a model pricing record rather than a frontend constant. Proposed shape:

```json
{
  "capability": "image_generation",
  "provider": "...",
  "model": "...",
  "billing_unit": "provider_cost_usd",
  "quality_tiers": ["fast", "standard", "quality"],
  "enabled": false
}
```

`enabled` stays false until the backend route, provider verification, refund behavior, and production pricing are tested.

## Content and age metadata

Do not infer adulthood from clothing, art style, or labels. If mature generation is ever supported by a provider, use explicit structured character age/adult metadata and the site's existing age/content policy. Provider policy still applies to every request.

## Storage

For V1, prefer a local story attachment record containing:

- generated timestamp
- story message / moment reference
- provider/model label
- quality tier
- prompt compiler version
- local image reference or data managed by the client

Never store the player's API key in the story or backup. Full-story export should either include local image assets explicitly or clearly record that the asset is external/missing; do not silently create broken references.

## Rollout plan

### Phase 1 — contract / UI shell

- feature flag default OFF
- visual context builder
- preview UI
- quality/source selector
- no production provider call

### Phase 2 — BYOK pilot

- one compatible image provider
- explicit user action only
- local attachment rendering
- mobile/desktop validation

### Phase 3 — hosted 燈火 pilot

- pricing config
- estimate / reserve / settle / refund
- provider usage verification
- small allowlist before public enablement

### Phase 4 — continuity improvements

- optional reference-image support where provider allows it
- character visual profile
- regenerate / variation controls

Video generation is intentionally out of scope until image generation, billing, storage, continuity, and failure recovery are stable.

## Acceptance criteria for implementation PRs

- [ ] Feature can be disabled globally without breaking chat.
- [ ] Existing text RP behavior is unchanged when disabled.
- [ ] Full transcript is not sent to the image provider by default.
- [ ] BYOK requests never deduct 燈火.
- [ ] Hosted cost is shown before confirmation.
- [ ] Failed/unverified hosted requests do not permanently consume 燈火.
- [ ] API keys are absent from story saves and exports.
- [ ] Generated images can be associated with a story moment locally.
- [ ] Mobile UI does not obscure the composer or story controls.
- [ ] Provider/model can be changed through configuration without rewriting character cards.
