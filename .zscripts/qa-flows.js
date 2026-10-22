const puppeteer = require('C:/Users/user/AppData/Local/Temp/opencode/pw/node_modules/puppeteer-core');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.QA_URL || 'http://localhost:3000/';
const OUT = 'C:/FullAZ/.zscripts/shots';

const clickByText = async (page, selector, text) => {
  const handle = await page.evaluateHandle(
    (sel, label) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      const visible = nodes.filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
      });
      return (
        visible.find((n) => n.textContent.trim().includes(label)) ||
        visible.find((n) => (n.getAttribute('aria-label') || '').includes(label)) ||
        null
      );
    },
    selector,
    text,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`Élément introuvable : ${selector} « ${text} »`);
  await el.click();
  await handle.dispose();
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  // ---------- Mobile 390 : menu plein écran ----------
  let page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 600));

  await clickByText(page, 'button', 'Ouvrir le menu');
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${OUT}/flow-mobile-menu.png` });
  const dialogOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')));
  console.log('menu mobile ouvert =', dialogOpen);

  // Échap ferme le menu
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  const dialogClosed = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
  console.log('menu mobile fermé par Échap =', dialogClosed);

  // ---------- Mobile 390 : vue connexion puis retour ----------
  await clickByText(page, 'a, button', 'Se connecter');
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${OUT}/flow-mobile-login.png`, fullPage: true });
  const hasPasswordField = await page.evaluate(() => Boolean(document.querySelector('input[type="password"]')));
  console.log('vue connexion affichée =', hasPasswordField);

  await clickByText(page, 'a, button', 'Accueil');
  await new Promise((r) => setTimeout(r, 700));
  const backHome = await page.evaluate(() => Boolean(document.querySelector('h1')));
  console.log('retour accueil =', backHome);
  await page.close();

  // ---------- Desktop 1440 : démo, FAQ, formulaire ----------
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 600));

  await clickByText(page, 'a, button', 'Demander une démo');
  await new Promise((r) => setTimeout(r, 900));
  const scrolled = await page.evaluate(() => window.scrollY > 400);
  console.log('CTA démo → section tarifs scrollee =', scrolled);
  await page.screenshot({ path: `${OUT}/flow-desktop-tarifs.png` });

  await clickByText(page, 'button', 'Comment importer mes');
  await new Promise((r) => setTimeout(r, 400));
  const faqOpen = await page.evaluate(() => {
    const open = document.querySelector('details[open], [data-state="open"]');
    return Boolean(open);
  });
  console.log('FAQ accordéon ouvert =', faqOpen);
  await page.screenshot({ path: `${OUT}/flow-desktop-faq.png` });

  await clickByText(page, 'a, button', 'Créer mon école');
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT}/flow-desktop-register.png`, fullPage: true });
  const registerVisible = await page.evaluate(() => document.body.innerText.includes('Créer mon école') || document.body.innerText.includes('inscription'));
  console.log('vue inscription affichée =', registerVisible);

  await browser.close();
  console.log('flux terminés');
})().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
