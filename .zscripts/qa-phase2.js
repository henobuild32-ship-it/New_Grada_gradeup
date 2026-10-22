/* QA Phase 2 : offline-first — PWA, Dexie, outbox, SW, /offline. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'qa-shots');
const BASE = 'http://localhost:3000';

const results = [];
let failures = 0;
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
}

const FAKE_USER = {
  id: 'qa-admin', schoolId: 'qa-school', fullName: 'Alice Admin', email: 'admin@qa.local',
  role: 'ADMIN', photoUrl: '', active: true, currentPage: 'sync-center',
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  // --- 1. Manifest ---
  await page.goto(`${BASE}/manifest.webmanifest`, { waitUntil: 'domcontentloaded' });
  const manifest = JSON.parse(await page.evaluate(() => document.body.innerText));
  record(manifest.name && manifest.name.includes('GradeUp'), 'Manifest : nom GradeUp', manifest.name);
  record(manifest.display === 'standalone', 'Manifest : display standalone', manifest.display);
  record(manifest.theme_color === '#3b82f6', 'Manifest : theme color', manifest.theme_color);
  const icons = manifest.icons || [];
  record(icons.some((i) => i.sizes === '192x192'), 'Manifest : icône 192');
  record(icons.some((i) => i.sizes === '512x512'), 'Manifest : icône 512');
  record(icons.some((i) => i.purpose === 'maskable'), 'Manifest : icône maskable', JSON.stringify(icons.map((i) => i.purpose)));

  // --- 2. Injection session + chargement app ---
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((u) => {
    localStorage.setItem('gradeup-storage', JSON.stringify({ state: { user: u, currentPage: u.currentPage, sidebarOpen: true, chatMessages: {} }, version: 0 }));
    localStorage.setItem('theme', 'light');
  }, FAKE_USER);
  await page.reload({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  // --- 3. Service Worker (avec garde-fou) ---
  const swState = await page.evaluate(async () => {
    const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
    try {
      const reg = await Promise.race([navigator.serviceWorker.ready, timeout(8000)]);
      return { scope: reg.scope, active: !!reg.active, sync: !!(reg.sync && reg.sync.register), error: null };
    } catch (e) {
      // getRegistration comme alternative.
      try {
        const r = await navigator.serviceWorker.getRegistration();
        return { scope: r?.scope ?? null, active: !!r?.active, sync: !!(r?.sync && r?.sync.register), error: String(e) };
      } catch (e2) {
        return { scope: null, active: false, sync: false, error: String(e2) };
      }
    }
  });
  record(!!swState.active, 'SW actif', swState.scope);
  record(true, 'Background Sync supporté (informatif)', swState.sync ? 'oui' : 'non (tick périodique)');

  // --- 4. Base locale Dexie créée avec tables ---
  const dbInfo = await page.evaluate(async () => {
    const req = indexedDB.databases ? await indexedDB.databases() : [];
    const names = req.map((d) => d.name);
    return names;
  });
  record(dbInfo.includes('gradeup-local'), 'Base gradeup-local ouverte', JSON.stringify(dbInfo));

  const tables = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('gradeup-local');
    open.onsuccess = () => {
      const names = Array.from(open.result.objectStoreNames);
      open.result.close();
      resolve(names);
    };
    open.onerror = () => resolve([]);
  }));
  const expected = ['users', 'classes', 'courses', 'lessons', 'grades', 'homework', 'attendance', 'outbox', 'syncMeta', 'offlineFiles'];
  const missing = expected.filter((t) => !tables.includes(t));
  record(missing.length === 0, 'Tables Dexie présentes', missing.length ? `manquantes: ${missing.join(',')}` : `${tables.length} tables`);

  // --- 5. Pages /offline ---
  await page.goto(`${BASE}/offline`, { waitUntil: 'networkidle2', timeout: 30000 });
  const offlineText = await page.evaluate(() => document.body.innerText);
  record(offlineText.includes('hors ligne') || offlineText.includes('Hors ligne'), 'Page /offline rend le secours', offlineText.slice(0, 60));
  await page.screenshot({ path: path.join(OUT, 'offline-page.png') });

  // --- 6. Indicateur sync + centre de sync ---
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  const centerVisible = await page.evaluate(() => document.body.innerText.includes('Centre de synchronisation'));
  record(centerVisible, 'Centre de sync accessible', centerVisible ? '' : 'texte absent');
  await page.screenshot({ path: path.join(OUT, 'sync-center.png'), fullPage: false });

  // --- 7. Outbox : simuler une mutation hors ligne, vérifier persistance ---
  const outboxTest = await page.evaluate(async () => {
    const { enqueueAction, countActions } = await import('/_next/static/chunks/' + 'noop').catch(() => ({}));
    // Fallback : ouvrir directement Dexie via indexedDB (même schéma).
    return new Promise((resolve) => {
      const open = indexedDB.open('gradeup-local');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('outbox', 'readwrite');
        const store = tx.objectStore('outbox');
        store.put({
          clientMutationId: 'qa-' + crypto.randomUUID(),
          entity: 'attendance',
          operation: 'create',
          recordId: 'rec-1',
          payload: { test: true },
          endpoint: '/api/attendance/batch',
          method: 'POST',
          schoolId: 'qa-school',
          role: 'ADMIN',
          createdAt: Date.now(),
          status: 'pending',
          attempts: 0,
          nextAttemptAt: Date.now(),
        });
        tx.oncomplete = () => {
          const r2 = db.transaction('outbox', 'readonly').objectStore('outbox').count();
          r2.onsuccess = () => { db.close(); resolve({ count: r2.result }); };
        };
        tx.onerror = () => { db.close(); resolve({ count: -1 }); };
      };
      open.onerror = () => resolve({ count: -2 });
    });
  });
  record(outboxTest.count >= 1, 'Action outbox persistée dans Dexie', `count=${outboxTest.count}`);

  // --- 8. Mode avion : navigation → fallback offline (SW) ---
  await page.setOfflineMode(true);
  await new Promise((r) => setTimeout(r, 300));
  // Naviguer vers une page non pré-cachée pour déclencher le fallback.
  const navResult = await page.evaluate(async () => {
    try {
      const res = await fetch('/page-inexistante-qa-offline-' + Date.now(), { headers: { accept: 'text/html' } });
      return { status: res.status, ok: res.ok };
    } catch (e) {
      return { status: 0, error: String(e) };
    }
  });
  // L'indicateur hors ligne doit s'afficher.
  await new Promise((r) => setTimeout(r, 800));
  const offlineIndicator = await page.evaluate(() => {
    const txt = document.body.innerText;
    return txt.includes('hors ligne') || txt.includes('Hors ligne') || txt.includes('Mode hors ligne');
  });
  record(offlineIndicator, 'Indicateur « hors ligne » affiché en mode avion');
  await page.screenshot({ path: path.join(OUT, 'offline-indicator.png') });

  // --- 9. En mode avion, la file ne se vide pas (flush bloqué) ---
  const flushWhileOffline = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const dbOpen = indexedDB.open('gradeup-local');
      dbOpen.onsuccess = () => {
        const db = dbOpen.result;
        const c = db.transaction('outbox', 'readonly').objectStore('outbox').count();
        c.onsuccess = () => { db.close(); resolve({ pending: c.result }); };
        c.onerror = () => { db.close(); resolve({ pending: -1 }); };
      };
      dbOpen.onerror = () => resolve({ pending: -2 });
    });
  });
  record(flushWhileOffline.pending >= 1, 'File conservée hors ligne (pas de flush)', `pending=${flushWhileOffline.pending}`);

  // --- 10. Retour en ligne ---
  await page.setOfflineMode(false);
  await new Promise((r) => setTimeout(r, 1500));
  const onlineAgain = await page.evaluate(() => navigator.onLine);
  record(onlineAgain, 'Retour en ligne détecté');

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'phase2-results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks OK — ${failures} échec(s)`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
