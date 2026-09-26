# Video Boost — Chrome extension (MV3, vanilla JS, no build)

- `src/background.js` — service worker: all AI calls (streaming over Port `vb-chat`, `models` message) + channel RSS (`channel` message). Keys never leave it.
- `src/shared/providers.js` — provider catalogue + default settings (shared by SW and content scripts).
- `src/content/studio.js` — YouTube Studio DOM adapter (`window.VBStudio`): fields, tags, params (category/kids/promo/altered), vidIQ text+score, content rows. Selectors have fallbacks; Studio markup changes without notice.
- `src/content/youtube.js` — www.youtube.com watch/Shorts reader (`window.VBYouTube`, parses ytInitialPlayerResponse).
- `src/content/tools.js` — one-shot `ask()`, title tester, local title score (`window.VBTools`).
- `src/content/ai.js` — system prompt + parsing of the ```boost JSON block (`window.VBAI`).
- `src/content/panel.js` / `panel.css` — shadow-DOM panel, modes `edit` (video edit page) and `global` (rest of Studio + youtube.com); style contract at top of panel.css.
- Test: `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tools/e2e.js` (mock Studio/YouTube pages in `tools/mock-*`, mocked Groq + RSS).

## Never
- Write to Studio without an explicit user click.
- Send the API key from the content script or show it back in the UI.
- Save in Studio on the user's behalf.
