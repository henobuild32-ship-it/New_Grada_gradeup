/* QA Phase 1 : mobile-first 4 rôles × 4 viewports (shell rendu via user injecté). */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'qa-shots');
const BASE = 'http://localhost:3000';

const USERS = {
  ADMIN: {
    id: 'qa-admin', schoolId: 'qa-school', fullName: 'Alice Admin', email: 'admin@qa.local',
    role: 'ADMIN', photoUrl: '', active: true, currentPage: 'admin-dashboard',
  },
  TEACHER: {
    id: 'qa-teacher', schoolId: 'qa-school', fullName: 'Tina Prof', email: 'teacher@qa.local',
    role: 'TEACHER', photoUrl: '', active: true, currentPage: 'teacher-dashboard',
    isTitulaire: true, titulaireClassIds: [],
  },
  STUDENT: {
    id: 'qa-student', schoolId: 'qa-school', fullName: 'Sam Élève', email: 'student@qa.local',
    role: 'STUDENT', photoUrl: '', active: true, currentPage: 'student-dashboard',
    gender: 'M', matricule: 'QA-001', academicYear: '2025-2026',
  },
  PARENT: {
    id: 'qa-parent', schoolId: 'qa-school', fullName: 'Paul Parent', email: 'parent@qa.local',
    role: 'PARENT', photoUrl: '', active: true, currentPage: 'parent-dashboard',
    parentCode: 'QA-CODE',
  },
};

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

const results = [];
let failures = 0;

function record(ok, label, detail) {
  results.push({ ok, label, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
}

async function injectSession(page, user, theme) {
  await page.evaluate((u, t) => {
    localStorage.setItem('gradeup-storage', JSON.stringify({
      state: {
        user: u,
        currentPage: u.currentPage,
        sidebarOpen: true,
        chatMessages: {},
      },
      version: 0,
    }));
    localStorage.setItem('theme', t);
  }, user, theme);
}

async function measure(page) {
  return page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const [role, user] of Object.entries(USERS)) {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.width, height: vp.height });
        const tag = `${role} ${vp.name}`;

        // 1) Établir l'origine puis injecter la session (light).
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await injectSession(page, user, 'light');
        await page.reload({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 800));

        // 2) Pas de scroll horizontal.
        const m = await measure(page);
        record(m.scrollWidth <= m.innerWidth + 1, `${tag} — pas de scroll horizontal`,
          `scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);

        // 3) Bottom nav présente et complète sur mobile, absente sur desktop.
        const isMobile = vp.width < 768;
        if (isMobile) {
          const nav = await page.$('nav[aria-label="Navigation principale"]');
          record(!!nav, `${tag} — bottom nav présente`);
          if (nav) {
            const tabCount = await page.$$eval('nav[aria-label="Navigation principale"] button', (els) => els.length);
            record(tabCount === 5, `${tag} — 5 entrées bottom nav (4 + Plus)`, `count=${tabCount}`);
            const targets = await page.$$eval(
              'nav[aria-label="Navigation principale"] button',
              (els) => els.map((el) => {
                const r = el.getBoundingClientRect();
                return Math.min(r.width, r.height);
              })
            );
            record(targets.every((s) => s >= 34), `${tag} — cibles bottom nav ≥ ~44px (min-dimension)`,
              `min=${Math.min(...targets).toFixed(1)}`);
          }

          // 4) Tiroir « Plus » s'ouvre.
          const plus = await page.$('nav[aria-label="Navigation principale"] button[aria-haspopup="dialog"]');
          if (plus) {
            await plus.click();
            await new Promise((r) => setTimeout(r, 600));
            const sheetVisible = await page.evaluate(() => {
              const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
              return dialogs.some((d) => {
                const s = getComputedStyle(d);
                return s.display !== 'none' && s.visibility !== 'hidden' && d.getBoundingClientRect().height > 40;
              });
            });
            record(sheetVisible, `${tag} — tiroir « Plus » ouvre`);
            await page.screenshot({ path: path.join(OUT, `${role}-${vp.name}-plus.png`), fullPage: false });
            await page.keyboard.press('Escape');
            await new Promise((r) => setTimeout(r, 400));
          } else {
            record(false, `${tag} — bouton « Plus » trouvé`);
          }
        } else {
          const nav = await page.$('nav[aria-label="Navigation principale"]');
          record(!nav, `${tag} — bottom nav absente sur ${vp.width >= 1024 ? 'desktop' : 'tablette'}`);
          // Tablette : sidebar repliable visible (md:), desktop : sidebar.
          const aside = await page.$('aside');
          record(!!aside, `${tag} — sidebar présente (≥768px)`);
        }

        // 5) Thème clair puis sombre.
        await page.screenshot({ path: path.join(OUT, `${role}-${vp.name}-light.png`), fullPage: false });
        await page.evaluate(() => localStorage.setItem('theme', 'dark'));
        await page.reload({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 800));
        const darkOk = await page.evaluate(() => {
          const hasDarkClass = document.documentElement.classList.contains('dark');
          const bg = getComputedStyle(document.body).backgroundColor;
          // Chrome peut renvoyer rgb(), rgba() ou lab().
          let lum = null;
          let m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (m) {
            lum = 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
          } else {
            m = bg.match(/lab\(([\d.]+)/);
            if (m) lum = Number(m[1]); // L* de CIELAB : < 50 = sombre
          }
          const bgDark = lum !== null ? lum < 50 : false;
          return { ok: hasDarkClass && bgDark, bg, hasDarkClass, lum };
        });
        record(darkOk.ok, `${tag} — thème sombre appliqué`,
          `classDark=${darkOk.hasDarkClass} bg=${darkOk.bg} lum=${darkOk.lum !== null ? darkOk.lum.toFixed(2) : 'n/a'}`);
        const mDark = await measure(page);
        record(mDark.scrollWidth <= mDark.innerWidth + 1, `${tag} — pas de scroll horizontal (sombre)`,
          `scrollWidth=${mDark.scrollWidth} innerWidth=${mDark.innerWidth}`);
        await page.screenshot({ path: path.join(OUT, `${role}-${vp.name}-dark.png`), fullPage: false });

        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks OK — ${failures} échec(s)`);
  console.log(`Captures : ${OUT}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
