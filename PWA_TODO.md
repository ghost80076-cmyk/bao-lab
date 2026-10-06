# Remaining activation step

Before this PR is ready to merge, wire the following into `index.html` `<head>`:

```html
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/css/pwa-install.css?v=1">
<script defer src="/js/pwa-install.js?v=1"></script>
```

Then run:

```sh
node --test tests/pwa-install-contract.test.mjs tests/pwa-index-integration.test.mjs tests/pwa-preview.test.mjs tests/pwa-index-required.test.mjs
```

Do not merge while `pwa-index-required.test.mjs` fails.
