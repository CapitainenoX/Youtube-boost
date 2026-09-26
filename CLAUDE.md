# Video Boost — Chrome extension (MV3, vanilla JS, no build)

- `src/background.js` — service worker: all AI calls (streaming over Port `vb-chat`, `models` message). Keys never leave it.
- `src/shared/providers.js` — provider catalogue + default settings (shared by SW and content scripts).
- `src/content/studio.js` — YouTube Studio DOM adapter (`window.VBStudio`). Selectors have fallbacks; Studio markup changes without notice.
- `src/content/ai.js` — system prompt + parsing of the ```boost JSON block (`window.VBAI`).
- `src/content/panel.js` / `panel.css` — shadow-DOM panel; style contract at top of panel.css.
- Test: `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tools/e2e.js` (mock Studio + mocked Groq).

## Never
- Write to Studio without an explicit user click.
- Send the API key from the content script or show it back in the UI.
- Save in Studio on the user's behalf.
