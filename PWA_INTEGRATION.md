# YoruBay PWA install integration

The PWA assets live in this branch. To activate the install experience, add the three tags from `pwa-head.html` to the main `index.html` head.

Behavior:
- Browser install prompt is captured and replaced with YoruBay UI.
- Prompt appears only when the browser reports the site as installable.
- “稍後再說” suppresses the prompt for seven days on that device.
- Installed/standalone sessions do not show the prompt.
- The service worker uses network-first navigation and only a minimal offline shell, avoiding caching story/API data.
