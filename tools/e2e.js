const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const EXT = require('path').resolve(__dirname, '..');
const OUT = process.env.OUT || require('os').tmpdir();
const answer = 'Voici une optimisation ciblée sur **minecraft house**.\n```boost\n' + JSON.stringify({
  titles: ['Minecraft : la maison facile en 5 min 🏠', 'Easy Minecraft House Tutorial', 'Maison Minecraft simple et belle'],
  description: 'Construis une maison Minecraft facile en 5 minutes !\n\nTutoriel pas à pas pour débutants.',
  tags: ['minecraft house', 'minecraft', 'easy minecraft house', 'minecraft tutorial', 'minecraft build'],
  hashtags: ['#minecraft', '#shorts', 'minecraftbuild'],
  category: 'Gaming'
}) + '\n```';
const sse = answer.match(/[\s\S]{1,25}/g).map(c => 'data: ' + JSON.stringify({ choices: [{ delta: { content: c } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';

(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let lastBody = null;
  await ctx.route('https://api.groq.com/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }] } });
    lastBody = route.request().postDataJSON();
    route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse });
  });
  await ctx.route('https://studio.youtube.com/**', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(__dirname + '/mock-studio.html', 'utf8') }));
  const page = await ctx.newPage();
  page.on('console', m => m.type() === 'error' && console.log('console:', m.text()));
  page.on('pageerror', e => console.log('pageerror:', e.message));

  await page.goto('https://studio.youtube.com/channel/UCx/videos');
  await page.waitForTimeout(1500);
  console.log('panel on list page:', await page.locator('#video-boost-root').isVisible());

  await page.goto('https://studio.youtube.com/video/abc123XYZ/edit');
  await page.waitForSelector('#video-boost-root .panel', { state: 'visible', timeout: 5000 });
  await page.screenshot({ path: OUT + '/1-empty.png' });

  // Settings
  await page.locator('#video-boost-root .tab[data-tab="settings"]').click();
  await page.locator('#video-boost-root [data-ref="key"]').fill('gsk_test_1234');
  await page.locator('#video-boost-root [data-ref="key"]').press('Tab');
  await page.waitForTimeout(400);
  await page.locator('#video-boost-root [data-action="load-models"]').click();
  await page.waitForTimeout(800);
  console.log('models note:', await page.locator('#video-boost-root [data-ref="modelNote"]').innerText());
  await page.screenshot({ path: OUT + '/2-settings.png' });

  // Video tab
  await page.locator('#video-boost-root .tab[data-tab="video"]').click();
  await page.locator('#video-boost-root [data-action="show-tags"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/3-video.png' });

  // Chat
  await page.locator('#video-boost-root .tab[data-tab="chat"]').click();
  await page.locator('#video-boost-root .quick [data-quick="all"]').click();
  await page.waitForSelector('#video-boost-root .card', { timeout: 8000 });
  console.log('system prompt has vidIQ:', /Score 72/.test(lastBody.messages[0].content), '| short:', /Short/.test(lastBody.messages[0].content));
  await page.screenshot({ path: OUT + '/4-chat.png' });

  // deselect one tag then add
  await page.locator('#video-boost-root .chip[data-tag="minecraft build"]').click();
  await page.locator('#video-boost-root [data-apply="tags"]').click();
  await page.waitForTimeout(600);
  console.log('studio tags:', await page.$$eval('ytcp-chip #chip-text', els => els.map(e => e.textContent)));
  await page.locator('#video-boost-root [data-apply="title"][data-k="0"]').click();
  await page.locator('#video-boost-root [data-apply="description"]').click();
  await page.locator('#video-boost-root [data-apply="hashtags"]').click();
  await page.waitForTimeout(300);
  console.log('title:', await page.locator('ytcp-video-title #textbox').innerText());
  console.log('desc:', JSON.stringify(await page.locator('ytcp-video-description #textbox').innerText()));
  await page.screenshot({ path: OUT + '/5-applied.png' });

  // remove a tag from Vidéo tab
  await page.locator('#video-boost-root .tab[data-tab="video"]').click();
  await page.locator('#video-boost-root [data-remove-tag="minecraft tutorial"]').click();
  await page.waitForTimeout(400);
  console.log('after remove:', await page.$$eval('ytcp-chip #chip-text', els => els.map(e => e.textContent)));

  // dark + close/launcher
  await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + '/6-dark.png' });
  await page.keyboard.press('Alt+KeyB');
  await page.waitForTimeout(300);
  console.log('launcher visible after Alt+B:', await page.locator('#video-boost-root .launcher').isVisible());
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
