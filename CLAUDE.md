# Video Boost — Chrome extension (MV3, vanilla JS, no build)

- `src/background.js` — service worker: all AI calls (streaming over Port `vb-chat`, `models` message) + channel RSS (`channel` message). Keys never leave it.
- `src/shared/providers.js` — provider catalogue + default settings (shared by SW and content scripts).
- `src/content/studio.js` — YouTube Studio DOM adapter (`window.VBStudio`): fields, tags, params (category/kids/promo/altered), vidIQ text+score, content rows, save, `diagnose()`. Lookups pierce shadow roots (`deepAll`, cached 1 s); selectors have label fallbacks — Studio markup changes without notice.
- `src/content/youtube.js` — www.youtube.com watch/Shorts reader (`window.VBYouTube`, parses ytInitialPlayerResponse).
- `src/content/tools.js` — one-shot `ask()`, title tester, local title score (`window.VBTools`).
- `src/content/ai.js` — system prompt + parsing of the ```boost JSON block (`window.VBAI`).
- `src/content/panel.js` / `panel.css` — shadow-DOM panel, modes `edit` (video edit page) and `global` (rest of Studio + youtube.com); style contract at top of panel.css.
- `mobile/` — Android PWA (share target → AI → YouTube Data API `videos.update`). Reuses `src/shared/providers.js` and `src/content/ai.js` (with a `VBStudio` tag-helper shim). Served from GitHub Pages at the repo root.
- Test: `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tools/e2e.js` (mock Studio/YouTube pages in `tools/mock-*`, mocked Groq + RSS) · mobile: `node tools/e2e-mobile.js`.

## Never
- Call `videos.update` without re-reading the video first: snippet/status parts are replaced whole, omitted fields get wiped.
- Write to Studio without an explicit user click.
- Send the API key from the content script or show it back in the UI.
- Save in Studio without a click on the panel's « Enregistrer » button (`VBStudio.save()` is only called from it).
