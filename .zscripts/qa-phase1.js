/*
 * Phase 1 browser QA: four roles × four viewports, using Chrome's built-in
 * DevTools Protocol so this script does not need Puppeteer or Playwright.
 * Start the app at http://localhost:3000 before running this file.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'qa-shots');
const BASE = process.env.GRADEUP_QA_BASE || 'http://localhost:3000';

const USERS = {
  ADMIN: { id: 'qa-admin', schoolId: 'qa-school', fullName: 'Alice Admin', email: 'admin@qa.local', role: 'ADMIN', photoUrl: '', active: true, currentPage: 'admin-dashboard' },
  TEACHER: { id: 'qa-teacher', schoolId: 'qa-school', fullName: 'Tina Prof', email: 'teacher@qa.local', role: 'TEACHER', photoUrl: '', active: true, currentPage: 'teacher-dashboard', isTitulaire: true, titulaireClassIds: [] },
  STUDENT: { id: 'qa-student', schoolId: 'qa-school', fullName: 'Sam Élève', email: 'student@qa.local', role: 'STUDENT', photoUrl: '', active: true, currentPage: 'student-dashboard', gender: 'M', matricule: 'QA-001', academicYear: '2025-2026' },
  PARENT: { id: 'qa-parent', schoolId: 'qa-school', fullName: 'Paul Parent', email: 'parent@qa.local', role: 'PARENT', photoUrl: '', active: true, currentPage: 'parent-dashboard', parentCode: 'QA-CODE' },
};

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

const results = [];
let failures = 0;
let nextId = 0;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function record(ok, label, detail = '') {
  results.push({ ok, label, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

class CdpClient {
  constructor(url) {
    this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools timeout: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
  }
}

async function waitForDevTools(profilePath, chrome) {
  const activePort = path.join(profilePath, 'DevToolsActivePort');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with ${chrome.exitCode}`);
    if (fs.existsSync(activePort)) {
      const [port, browserPath] = fs.readFileSync(activePort, 'utf8').trim().split(/\r?\n/);
      return { port: Number(port), browserPath };
    }
    await sleep(200);
  }
  throw new Error('Chrome did not expose its DevTools endpoint.');
}

async function waitUntilReady(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate('document.readyState === "complete"')) return;
    } catch { /* the initial document may still be navigating */ }
    await sleep(200);
  }
  throw new Error('The page did not finish loading.');
}

async function navigate(page, url) {
  await page.send('Page.navigate', { url });
  await waitUntilReady(page);
  await sleep(700);
}

async function screenshot(page, filePath) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
}

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
  fs.mkdirSync(OUT, { recursive: true });
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gradeup-phase1-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profilePath}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-gpu', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let browser;
  let page;
  try {
    const devtools = await waitForDevTools(profilePath, chrome);
    browser = new CdpClient(`ws://127.0.0.1:${devtools.port}${devtools.browserPath}`);
    const target = await (await fetch(`http://127.0.0.1:${devtools.port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    page = new CdpClient(target.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');

    for (const [role, user] of Object.entries(USERS)) {
      for (const viewport of VIEWPORTS) {
        const tag = `${role} ${viewport.name}`;
        await page.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.width < 768,
        });
        await navigate(page, BASE);

        const userLiteral = JSON.stringify(user);
        await page.evaluate(`(() => {
          localStorage.setItem('gradeup-storage', JSON.stringify({ state: { user: ${userLiteral}, currentPage: ${JSON.stringify(user.currentPage)}, sidebarOpen: true, chatMessages: {} }, version: 0 }));
          localStorage.setItem('theme', 'light');
        })()`);
        await navigate(page, BASE);
        await sleep(600);

        const metrics = await page.evaluate(`({
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
          innerWidth: window.innerWidth,
        })`);
        record(metrics.scrollWidth <= metrics.innerWidth + 1, `${tag} — pas de scroll horizontal`, `scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth}`);

        const isMobile = viewport.width < 768;
        const navInfo = await page.evaluate(`(() => {
          const nav = document.querySelector('nav[aria-label="Navigation principale"]');
          const buttons = nav ? [...nav.querySelectorAll('button')] : [];
          return {
            exists: Boolean(nav),
            count: buttons.length,
            targets: buttons.map((button) => { const rect = button.getBoundingClientRect(); return Math.min(rect.width, rect.height); }),
            plus: Boolean(nav?.querySelector('button[aria-haspopup="dialog"]')),
          };
        })()`);

        if (isMobile) {
          record(navInfo.exists, `${tag} — bottom nav présente`);
          record(navInfo.count === 5, `${tag} — 5 entrées bottom nav`, `count=${navInfo.count}`);
          record(navInfo.targets.length === 5 && navInfo.targets.every((size) => size >= 44), `${tag} — cibles tactiles ≥ 44 px`, `min=${navInfo.targets.length ? Math.min(...navInfo.targets).toFixed(1) : 'n/a'}`);
          record(navInfo.plus, `${tag} — bouton Plus trouvé`);
          if (navInfo.plus) {
            await page.evaluate(`document.querySelector('nav[aria-label="Navigation principale"] button[aria-haspopup="dialog"]').click()`);
            await sleep(500);
            const sheetVisible = await page.evaluate(`[...document.querySelectorAll('[role="dialog"]')].some((dialog) => {
              const style = getComputedStyle(dialog);
              return style.display !== 'none' && style.visibility !== 'hidden' && dialog.getBoundingClientRect().height > 40;
            })`);
            record(sheetVisible, `${tag} — tiroir Plus ouvert`);
            await screenshot(page, path.join(OUT, `${role}-${viewport.name}-plus.png`));
            await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
            await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
          }
        } else {
          const desktopInfo = await page.evaluate(`(() => {
            const nav = document.querySelector('nav[aria-label="Navigation principale"]');
            const aside = document.querySelector('aside');
            return { navExists: Boolean(nav), asideVisible: Boolean(aside && getComputedStyle(aside).display !== 'none' && aside.getBoundingClientRect().width > 0) };
          })()`);
          record(!desktopInfo.navExists, `${tag} — bottom nav absente`);
          record(desktopInfo.asideVisible, `${tag} — sidebar présente`);
        }

        await screenshot(page, path.join(OUT, `${role}-${viewport.name}-light.png`));
        await page.evaluate("localStorage.setItem('theme', 'dark'); location.reload();");
        await waitUntilReady(page);
        await sleep(600);
        const darkState = await page.evaluate(`(() => {
          const bg = getComputedStyle(document.body).backgroundColor;
          const rgb = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
          const lab = bg.match(/lab\\(([\\d.]+)/);
          const lum = rgb ? 0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3]) : (lab ? Number(lab[1]) : null);
          return { ok: document.documentElement.classList.contains('dark') && lum !== null && lum < 50, bg, lum };
        })()`);
        record(darkState.ok, `${tag} — thème sombre appliqué`, `bg=${darkState.bg} lum=${darkState.lum}`);
        const darkMetrics = await page.evaluate('({ scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0), innerWidth: window.innerWidth })');
        record(darkMetrics.scrollWidth <= darkMetrics.innerWidth + 1, `${tag} — pas de scroll horizontal sombre`, `scrollWidth=${darkMetrics.scrollWidth} innerWidth=${darkMetrics.innerWidth}`);
        await screenshot(page, path.join(OUT, `${role}-${viewport.name}-dark.png`));
      }
    }
  } finally {
    try { await browser?.send('Browser.close'); } catch { /* Chrome may already be closed */ }
    try { page?.ws.close(); } catch { /* ignore cleanup errors */ }
    try { browser?.ws.close(); } catch { /* ignore cleanup errors */ }
    if (chrome.exitCode === null) chrome.kill();
  }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.filter((result) => result.ok).length}/${results.length} checks OK — ${failures} échec(s)`);
  console.log(`Captures : ${OUT}`);
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
