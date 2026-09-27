// Renders icons/icon{16,48,128}.png from an inline SVG with the bundled Chromium (Playwright).
// Usage: node tools/make-icons.js
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');

const svg = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#121212"/>
  <path d="M71 18 32 72h30l-6 38 40-54H66l5-38z" fill="#ffffff"/>
</svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [16, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(size)}`);
    await page.locator('svg').screenshot({ path: path.join(__dirname, '..', 'icons', `icon${size}.png`), omitBackground: true });
  }
  // Mobile PWA icons: full-bleed square (Android masks it), bolt inside the 80 % safe zone.
  const pwa = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#121212"/>
    <path d="M69 30 40 70h22l-4 28 30-40H66l3-28z" fill="#ffffff"/>
  </svg>`;
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}</style>${pwa(size)}`);
    await page.locator('svg').screenshot({ path: path.join(__dirname, '..', 'mobile', `icon-${size}.png`) });
  }
  await browser.close();
})();
