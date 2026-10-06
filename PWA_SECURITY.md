# PWA security / privacy boundary

The service worker must remain a presentation-shell feature. It must not inspect, cache, replay, or persist chat API requests, model-provider responses, API keys, story saves, memories, or account/session payloads. Any future expansion of offline behavior should be reviewed against YoruBay's local-first storage model before release.
