# Browser behavior

Chromium-based browsers can surface the custom YoruBay install action after `beforeinstallprompt` fires. Browsers that do not expose that event simply keep the normal website experience; no fake install button is shown. Installed sessions are detected through standalone display mode (plus the iOS standalone flag) and suppress the prompt.
