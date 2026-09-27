// End-to-end check of the mobile PWA (mobile/): serves the repo on a fake GitHub Pages origin, stubs Google
// sign-in, the YouTube Data API and Groq, then runs the "shared link → AI → apply" flow on a phone viewport.
// Usage: node tools/e2e-mobile.js   (screenshots → $OUT or tmp)
const { chromium, devices } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.OUT || require('os').tmpdir();
const ORIGIN = 'https://capitainenox.github.io';
const BASE = `${ORIGIN}/Youtube-boost/mobile/`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const assert = (c, m) => { if (!c) { console.error('✗', m); process.exitCode = 1; } else console.log('✓', m); };

const video = {
  id: 'ddddddddd01',
  snippet: { title: 'Minecraft maison', description: 'Ma maison.', tags: ['minecraft'], categoryId: '20', defaultLanguage: 'fr' },
  status: { privacyStatus: 'private', license: 'youtube', embeddable: true, publicStatsViewable: true, selfDeclaredMadeForKids: false },
  contentDetails: { duration: 'PT45S' }
};
const answer = 'Voilà.\n```boost\n' + JSON.stringify({
  titles: ['Maison Minecraft facile en 45 s', 'Easy Minecraft House'],
  description: 'Construis une maison Minecraft en 45 secondes.',
  tags: ['minecraft house', 'minecraft', 'easy minecraft house', 'minecraft shorts'],
  hashtags: ['#minecraft', '#shorts'],
  category: 'Gaming'
}) + '\n```';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
  let put = null;

  await ctx.route(`${ORIGIN}/Youtube-boost/**`, r => {
    const rel = new URL(r.request().url()).pathname.replace('/Youtube-boost/', '');
    const file = path.join(ROOT, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return r.fulfill({ status: 404 });
    r.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { oauth2: { initTokenClient: cfg => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'tok', expires_in: 3600 }), 50) }) } } };` }));
  await ctx.route('https://www.googleapis.com/youtube/v3/**', r => {
    const req = r.request();
    if (req.headers().authorization !== 'Bearer tok') return r.fulfill({ status: 401, json: {} });
    if (req.method() === 'PUT') { put = req.postDataJSON(); return r.fulfill({ json: { ...put } }); }
    if (req.url().includes('/videos?')) return r.fulfill({ json: { items: [video] } });
    if (req.url().includes('/channels?')) return r.fulfill({ json: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUx' } } }] } });
    return r.fulfill({ json: { items: [{ snippet: { title: 'Minecraft maison', publishedAt: '2026-09-26T10:00:00Z' }, contentDetails: { videoId: 'ddddddddd01' } }] } });
  });
  await ctx.route('https://api.groq.com/**', r => r.fulfill({ json: { choices: [{ message: { content: answer } }] } }));
  await ctx.route('https://i.ytimg.com/**', r => r.fulfill({ status: 404 }));

  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));

  // One-time settings
  await page.goto(BASE);
  await page.click('[data-go="settings"]');
  await page.fill('#key', 'gsk_test');
  await page.press('#key', 'Tab');
  await page.fill('#clientId', '123.apps.googleusercontent.com');
  await page.press('#clientId', 'Tab');
  await page.screenshot({ path: path.join(OUT, 'm1-settings.png'), fullPage: true });

  // Shared from the YouTube app: Web Share Target GET → ?text=<link>
  await page.goto(`${BASE}?text=${encodeURIComponent('https://youtube.com/shorts/ddddddddd01?si=abc')}`);
  await page.click('#loginThen');
  await page.waitForSelector('#apply', { timeout: 8000 });
  await page.screenshot({ path: path.join(OUT, 'm2-proposal.png'), fullPage: true });
  assert(await page.locator('button.chip[aria-pressed="true"]').count() === 3, 'shared Short opened, 3 new tags preselected (duplicate skipped)');

  await page.click('[data-tag="minecraft shorts"]');   // user removes one
  await page.click('#apply');
  await page.waitForSelector('#apply.done', { timeout: 5000 });
  await page.screenshot({ path: path.join(OUT, 'm3-applied.png') });
  assert(JSON.stringify(put.snippet.tags) === JSON.stringify(['minecraft', 'minecraft house', 'easy minecraft house']), `tags appended after existing ${JSON.stringify(put.snippet.tags)}`);
  assert(put.snippet.title === 'Maison Minecraft facile en 45 s' && put.snippet.categoryId === '20', 'title + category written');
  assert(put.snippet.description === 'Ma maison.\n\n#minecraft #shorts', 'existing description kept, hashtags appended');
  assert(put.status.privacyStatus === 'private' && put.status.selfDeclaredMadeForKids === false && put.status.containsSyntheticMedia === false && put.snippet.defaultLanguage === 'fr', 'status and language preserved, audience + AI flags sent');

  // Home list after login
  await page.click('[data-go="home"]');
  await page.waitForSelector('.vrow', { timeout: 5000 });
  assert(true, 'home lists latest uploads');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
