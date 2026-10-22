const puppeteer = require('C:/Users/user/AppData/Local/Temp/opencode/pw/node_modules/puppeteer-core');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.QA_URL || 'http://localhost:3000/';
const OUT = 'C:/FullAZ/.zscripts/shots';

const VIEWPORTS = [
  { name: '360', width: 360, height: 800, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '768', width: 768, height: 1024, mobile: true },
  { name: '1024', width: 1024, height: 800, mobile: false },
  { name: '1440', width: 1440, height: 900, mobile: false },
];

const SCHEMES = ['light', 'dark'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
  });

  const report = [];

  for (const scheme of SCHEMES) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      const consoleIssues = [];
      page.on('console', (msg) => {
        const t = msg.text();
        if (/error|warn|hydrat|mismatch/i.test(t) && !/Download the React DevTools|\[HMR\]/.test(t)) {
          consoleIssues.push(`${msg.type()}: ${t.slice(0, 160)}`);
        }
      });
      page.on('pageerror', (err) => consoleIssues.push(`pageerror: ${err.message.slice(0, 200)}`));

      await page.setViewport({
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.mobile ? 2 : 1,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      });
      // Une seule appel : emulateMediaFeatures remplace la liste précédente.
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: scheme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ]);
      // next-themes est verrouillé sur le mode clair par défaut : le mode sombre
      // passe par le bouton du site, qui écrit la clé « theme ».
      await page.evaluateOnNewDocument((value) => {
        try {
          if (value) window.localStorage.setItem('theme', value);
          else window.localStorage.removeItem('theme');
        } catch {}
      }, scheme === 'dark' ? 'dark' : null);

      await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
      await page.evaluate(() => document.fonts?.ready);
      await new Promise((r) => setTimeout(r, 800));

      const metrics = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const offenders = Array.from(document.querySelectorAll('body *'))
          .map((n) => ({ n, r: n.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && r.right > vw + 1)
          .slice(0, 8)
          .map(({ n, r }) => `${n.tagName}.${String(n.className).slice(0, 42)}@${Math.round(r.right)}`);
        return {
          vw,
          scrollWidth: document.documentElement.scrollWidth,
          overflow: document.documentElement.scrollWidth > vw + 1,
          offenders,
          themeClass: document.documentElement.className,
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim().slice(0, 60) || null,
        };
      });

      const file = `${OUT}/qa-${scheme}-${vp.name}.png`;
      await page.screenshot({ path: file, fullPage: true });

      report.push({ scheme, viewport: vp.name, metrics, consoleIssues: [...new Set(consoleIssues)].slice(0, 6) });
      console.log(
        `${scheme.padEnd(5)} ${vp.name.padEnd(5)} vw=${metrics.vw} scrollW=${metrics.scrollWidth} overflow=${metrics.overflow} theme="${metrics.themeClass}"` +
          (metrics.offenders.length ? ` offenders=[${metrics.offenders.join(' | ')}]` : '') +
          (consoleIssues.length ? ` console=${[...new Set(consoleIssues)].length}` : ''),
      );
      await page.close();
    }
  }

  fs.writeFileSync(`${OUT}/qa-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log('report →', `${OUT}/qa-report.json`);
})().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
