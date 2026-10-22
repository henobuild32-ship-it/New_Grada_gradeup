const puppeteer = require('C:/Users/user/AppData/Local/Temp/opencode/pw/node_modules/puppeteer-core');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.QA_URL || 'http://localhost:3000/';
const OUT = 'C:/FullAZ/.zscripts/shots';

// Détails mobile : un « coup » de 844 px par section pour juger la lisibilité.
const OFFSETS = [0, 900, 1800, 2700, 3600, 4500, 5400, 6300, 7200, 8100, 9000, 9900];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.evaluate(() => document.fonts?.ready);
  await new Promise((r) => setTimeout(r, 800));

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log('page height', height);

  for (const y of OFFSETS) {
    if (y >= height) break;
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await new Promise((r) => setTimeout(r, 350));
    await page.screenshot({ path: `${OUT}/detail-390-y${y}.png` });
    console.log('shot', y);
  }

  await browser.close();
})().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
