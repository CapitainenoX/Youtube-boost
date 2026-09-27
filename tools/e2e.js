// End-to-end check: loads the unpacked extension in Chromium against mock Studio / YouTube pages
// and a mocked Groq API, then drives every panel flow.
// Usage: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tools/e2e.js   (screenshots → $OUT or tmp)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const mocks = require('./mock-pages');

const EXT = path.resolve(__dirname, '..');
const OUT = process.env.OUT || require('os').tmpdir();
const STUDIO = fs.readFileSync(path.join(__dirname, 'mock-studio.html'), 'utf8');

const block = obj => '```boost\n' + JSON.stringify(obj) + '\n```';
const answers = {
  optimise: 'Voici une optimisation ciblée sur **minecraft house**.\n' + block({
    titles: ['Minecraft : la maison facile en 5 min 🏠', 'Easy Minecraft House Tutorial', 'Maison Minecraft simple et belle'],
    description: 'Construis une maison Minecraft facile en 5 minutes !\n\nTutoriel pas à pas pour débutants.',
    tags: ['minecraft house', 'minecraft', 'easy minecraft house', 'minecraft tutorial', 'minecraft build'],
    hashtags: ['#minecraft', '#shorts', 'minecraftbuild'],
    category: 'Education'
  }),
  tester: block({ titles: ['Maison Minecraft', 'Maison Minecraft facile pour débutants', 'La maison Minecraft la plus simple en 5 minutes', 'Minecraft : 3 maisons faciles'] }),
  channel: '- Tes **Shorts** font ~5× plus de vues que tes vidéos longues.\n- Les titres avec un chiffre marchent mieux.'
};
const sse = text => text.match(/[\s\S]{1,25}/g).map(c => 'data: ' + JSON.stringify({ choices: [{ delta: { content: c } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';

const log = (...a) => console.log(...a);
const assert = (cond, msg) => { if (!cond) { console.error('✗', msg); process.exitCode = 1; } else log('✓', msg); };

(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const prompts = [];
  await ctx.route('https://api.groq.com/**', route => {
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'llama-3.3-70b-versatile' }] } });
    const body = route.request().postDataJSON();
    prompts.push(body);
    const last = body.messages.at(-1).content;
    const text = /title candidates/.test(last) ? answers.tester : /chaîne|marche/i.test(last) ? answers.channel : answers.optimise;
    route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse(text) });
  });
  await ctx.route('https://www.youtube.com/feeds/**', r => r.fulfill({ contentType: 'application/xml', body: mocks.feed }));
  await ctx.route('https://studio.youtube.com/**', r => r.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: /\/channel\/.+\/videos/.test(r.request().url()) ? mocks.contentPage : STUDIO
  }));
  await ctx.route('https://www.youtube.com/watch**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: mocks.watchPage }));

  const page = await ctx.newPage();
  page.on('pageerror', e => log('pageerror:', e.message));
  const vb = sel => page.locator(`#video-boost-root ${sel}`);
  const shot = name => page.screenshot({ path: path.join(OUT, name) });

  /* Studio content page → global panel, channel id captured, rows read */
  await page.goto('https://studio.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx/videos');
  await page.waitForTimeout(1200);
  assert(await vb('.launcher').isVisible(), 'global mode: launcher shown, panel closed by default');
  await vb('.launcher').click();
  await vb('.vrow').first().waitFor({ timeout: 5000 });
  assert(await vb('.vrow').count() === 3, 'Vidéos: 3 rows from Studio content table');
  await shot('g1-studio-videos.png');

  /* Settings: key + prefs */
  await vb('.tab[data-tab="settings"]').click();
  await vb('[data-ref="key"]').fill('gsk_test_1234');
  await vb('[data-ref="key"]').press('Tab');
  await vb('[data-pref="madeForKids"][data-val="0"]').click();
  await vb('[data-pref="paidPromo"][data-val="1"]').click();
  await vb('[data-pref="altered"][data-val="1"]').click();
  await vb('[data-ref="prefCat"]').selectOption('6');
  await page.waitForTimeout(400);
  const saved = await vb('[data-ref="channelId"]').inputValue();
  assert(saved === 'UCxxxxxxxxxxxxxxxxxxxxxx', 'channel id auto-filled from Studio URL');
  await shot('g2-settings.png');

  /* Global chat uses channel data */
  await vb('.tab[data-tab="chat"]').click();
  await vb('.quick [data-quick="works"]').click();
  await page.waitForTimeout(1200);
  assert(/"Minecraft maison facile" · 12000 views/.test(prompts.at(-1).messages[0].content), 'global chat: channel stats sent to the AI');

  /* Edit page */
  await page.goto('https://studio.youtube.com/video/abc123XYZ/edit');
  await vb('.panel').waitFor({ state: 'visible', timeout: 5000 });
  await vb('.tab[data-tab="video"]').click();
  await page.waitForTimeout(300);
  await vb('[data-action="apply-prefs"]').click();
  await page.waitForTimeout(800);
  const params = await page.evaluate(() => {
    const sr = t => document.querySelector(t).shadowRoot;
    const rb = (t, k) => sr(t).querySelectorAll('tp-yt-paper-radio-button')[k].getAttribute('aria-checked');
    return {
      kidsNo: rb('mock-audience', 1),
      promo: sr('mock-promo').querySelector('[name="VIDEO_PAID_PRODUCT_PLACEMENT_NOTIFY"]').getAttribute('aria-checked'),
      age: sr('mock-promo').querySelector('[name="VIDEO_AGE_RESTRICTION_NONE"]').getAttribute('aria-checked'),
      altYes: rb('mock-altered', 0),
      cat: sr('mock-category').querySelector('.dropdown-trigger-text').textContent
    };
  });
  assert(params.kidsNo === 'true' && params.promo === 'true' && params.altYes === 'true' && params.cat === 'Jeux vidéo' && params.age === 'true', `prefs applied ${JSON.stringify(params)}`);
  await vb('[data-ref="catSelect"]').selectOption('12');
  await page.waitForTimeout(600);
  assert(await page.evaluate(() => document.querySelector('mock-category').shadowRoot.querySelector('.dropdown-trigger-text').textContent) === 'Éducation', 'category changed from the panel');
  await vb('[data-action="save"]').click();
  await page.waitForTimeout(800);
  assert(await page.evaluate(() => window.__saved === true), 'Enregistrer button clicked Studio save');

  /* Title tester (vidIQ mock score) */
  await vb('[data-action="tester-start"]').click();
  await vb('[data-action="tester-start"]').waitFor({ timeout: 30000 });
  const title = await page.locator('ytcp-video-title #textbox').innerText();
  const status = await vb('.tester .muted').first().innerText();
  log('  tester →', title, '|', status);
  assert(title !== 'Minecraft maison facile' && /Meilleur titre/.test(status), 'title tester kept a better-scoring title');
  await shot('e1-tester.png');

  /* Chat proposal → apply category + tags */
  await vb('.tab[data-tab="chat"]').click();
  await vb('.quick [data-quick="all"]').click();
  await vb('.card').waitFor({ timeout: 8000 });
  const houseScore = await vb('.chip[data-tag="minecraft house"] .tscore').innerText();
  const tutoScore = await vb('.chip[data-tag="minecraft tutorial"] .tscore').innerText();
  assert(houseScore === '82' && tutoScore === '38', `tag notes read from vidIQ (house ${houseScore}, tutorial ${tutoScore})`);
  assert(/in English/.test(prompts.at(-1).messages[0].content), 'no video language set → titles/description asked in English');
  await vb('[data-action="tags-best"]').click();
  assert(await vb('.chip[data-tag="minecraft tutorial"]').getAttribute('aria-pressed') === 'false', '« Meilleurs » drops the low-scoring tag');
  await vb('.chip[data-tag="minecraft tutorial"]').click();   // user keeps it anyway
  await vb('[data-apply="tags"]').click();
  await page.waitForTimeout(600);
  const tags = await page.$$eval('ytcp-chip #chip-text', els => els.map(e => e.textContent));
  assert(tags.length === 5 && tags[0] === 'minecraft', `tags appended without duplicate ${JSON.stringify(tags)}`);
  await shot('e2-chat.png');

  /* Video picker from the edit page */
  await vb('[data-action="my-videos"]').click();
  await vb('.vrow').first().waitFor({ timeout: 5000 });
  await shot('e3-picker.png');
  await vb('[data-ref="pickInput"]').fill('https://youtu.be/ccccccccc02');
  await vb('[data-ref="pickForm"] button').click();
  await page.waitForURL('**/video/ccccccccc02/edit');
  assert(true, 'picker opened another video edit page');

  /* youtube.com watch page: hidden tags */
  await page.goto('https://www.youtube.com/watch?v=bbbbbbbbbb1');
  await page.waitForTimeout(1200);
  if (await vb('.launcher').isVisible()) await vb('.launcher').click();
  await vb('[data-action="copy-watched-tags"]').waitFor({ timeout: 5000 });
  const wtags = await vb('.field .chip.static').allInnerTexts();
  assert(wtags.includes('survival base'), `youtube.com: hidden tags read ${JSON.stringify(wtags)}`);
  await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
  await page.waitForTimeout(1000);
  await shot('y1-watch-dark.png');

  /* Extension reloaded while the tab stays open (↻ in chrome://extensions) */
  const [sw] = ctx.serviceWorkers();
  await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await page.waitForTimeout(1500);
  await page.keyboard.press('Alt+KeyB');
  await page.waitForTimeout(1000);
  const label = await vb('.launcher').innerText().catch(() => '');
  assert(/Recharger/.test(label), `stale script after extension reload shows « ${label.trim()} » instead of throwing`);

  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
