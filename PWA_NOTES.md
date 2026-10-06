Implementation notes

- No API keys, story data, memories, chats, or provider responses are cached by the service worker.
- Navigation is network-first; the cached index is only an offline fallback.
- Static same-origin assets are cache-on-first-use.
- Install UI is browser-gated through `beforeinstallprompt` and is therefore not shown on unsupported browsers.
- Dismissal is local-only and lasts seven days.
