# Internal world module visibility

Character-defined world modules can declare `visibility: "internal"`. The module remains in story state, receives normal state tracking and can be included in narrative context according to `context`. It is hidden from player-facing module tabs, builder summaries and the world-module manager.

Modules without this flag keep their existing public display behavior.

**Important:** This is UI concealment, not encryption. The local-first player can inspect their own story backup. A card must not explicitly reference the internal module in public Gameplay UI paths, archives, timelines, NPC cards or story prose. Private and player-visible state must remain separate.

The first work using this field is `shixu-yuanyangjie` for NPC off-screen impulse and motivation tracking.
