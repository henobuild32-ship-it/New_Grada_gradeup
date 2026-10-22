#!/usr/bin/env node
/**
 * Tests d'autorisation GradeUp — PHASE 3.
 *
 * Vérifie que chaque route sensible répond selon les 4 rôles (401 sans
 * session, 403 hors rôle, ownership respecté, pas d'escalade, isolation
 * inter-écoles, rate limiting).
 *
 * Prérequis :
 *   1. Serveur démarré        : npm run dev
 *   2. Base seedée            : npm run db:seed   (voir prisma/seed.js)
 *   3. Node >= 18 (fetch natif)
 *
 * Usage : npm run test:rbac   |   BASE_URL=http://localhost:3000 node scripts/rbac-check.mjs
 *
 * Comptes (seed) : admin@gradeup.cd / prof.kalala@gradeup.cd /
 * gracia.mputu@student.cd / parent.mputu@gradeup.cd — Mot de passe : Demo1234!
 * (chaque login utilise une IP X-Forwarded-For distincte pour ne pas
 *  déclencher le rate limit 5/15min par IP.)
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const INVITE = process.env.DEMO_INVITE_CODE || 'ECOLE-DEMO26';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo1234!';

// IDs fixes du seed (prisma/seed.js)
const ADMIN_ID = 'usr_demo_admin';
const TEACHER_ID = 'usr_demo_t_kalala';
const STUDENT_ID = 'usr_demo_s_mputu';
const OTHER_STUDENT_ID = 'usr_demo_s_ngoy';
const PARENT_ID = 'usr_demo_p_mputu';
const CHILD_ID = 'usr_demo_s_mputu';
const PARENT_CHILD_IDS = new Set([CHILD_ID, 'usr_demo_s_mbuyi', 'usr_demo_s_mwinga']);

const ACCOUNTS = {
  admin: { email: 'admin@gradeup.cd', adminLogin: true, ip: '10.10.0.1' },
  teacher: { email: 'prof.kalala@gradeup.cd', ip: '10.10.0.2' },
  student: { email: 'gracia.mputu@student.cd', ip: '10.10.0.3' },
  parent: { email: 'parent.mputu@gradeup.cd', ip: '10.10.0.4' },
};

const results = [];
let ipSeq = 100;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

function nextIp() {
  return `10.10.1.${++ipSeq}`;
}

async function login(acct, ipOverride) {
  const body = { inviteCode: INVITE, email: acct.email, password: PASSWORD };
  if (acct.adminLogin) body.isAdminLogin = true;
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ipOverride || acct.ip },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login ${acct.email} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const token = raw.find((c) => c.startsWith('gradeup_token='));
  if (!token) throw new Error(`login ${acct.email} : cookie gradeup_token absent`);
  return token.split(';')[0];
}

async function api(method, path, cookie, body, ip) {
  const headers = { 'x-forwarded-for': ip || nextIp() };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* réponse vide/non-JSON */
  }
  return { status: res.status, json, headers: res.headers };
}

async function expectStatus(name, [method, path, cookie, body], expected) {
  const exp = Array.isArray(expected) ? expected : [expected];
  try {
    const r = await api(method, path, cookie, body);
    record(name, exp.includes(r.status), `HTTP ${r.status} (attendu ${exp.join('/')})`);
    return r;
  } catch (e) {
    record(name, false, e.message);
    return null;
  }
}

function expectData(name, r, check) {
  if (!r) return record(name, false, 'pas de réponse');
  try {
    const detail = check(r.json);
    if (detail === true) return record(name, true);
    record(name, false, detail || 'condition non satisfaite');
  } catch (e) {
    record(name, false, e.message);
  }
}

async function main() {
  console.log(`— Tests d'autorisation GradeUp @ ${BASE} —\n`);

  // Préflight : serveur up ?
  try {
    const ping = await fetch(`${BASE}/api/health`);
    if (!ping.ok && ping.status !== 401) throw new Error(`HTTP ${ping.status}`);
  } catch (e) {
    console.error(
      `\n✖ Serveur injoignable sur ${BASE} — démarrez le dev server (npm run dev) et vérifiez la base (npm run db:seed).\n  Détail : ${e.message}`
    );
    process.exit(2);
  }

  // ── Logins (1 IP distincte par compte) ──────────────────────────────────
  const cookies = {};
  try {
    for (const [key, acct] of Object.entries(ACCOUNTS)) {
      cookies[key] = await login(acct);
      console.log(`  · session ${key} établie`);
    }
  } catch (e) {
    console.error(`\n✖ Échec de connexion : ${e.message}`);
    console.error('  → Avez-vous lancé `npm run db:seed` avec une base joignable ?');
    process.exit(2);
  }
  console.log('');

  // ── A. Authentification (middleware) ────────────────────────────────────
  console.log('A. Sans session → 401');
  await expectStatus('A1 GET /api/users anonyme', ['GET', '/api/users', null], 401);
  await expectStatus('A2 GET /api/audit-logs anonyme', ['GET', '/api/audit-logs', null], 401);
  await expectStatus('A3 GET /api/sync/pull anonyme', ['GET', '/api/sync/pull', null], 401);
  await expectStatus('A4 POST /api/sync/push anonyme', ['POST', '/api/sync/push', null, { mutations: [] }], 401);

  // ── B. Rôles ────────────────────────────────────────────────────────────
  console.log('\nB. Contrôle des rôles');
  await expectStatus('B1 PARENT → /api/audit-logs', ['GET', '/api/audit-logs', cookies.parent], 403);
  await expectStatus('B2 STUDENT → /api/audit-logs', ['GET', '/api/audit-logs', cookies.student], 403);
  await expectStatus('B3 TEACHER → /api/audit-logs', ['GET', '/api/audit-logs', cookies.teacher], 403);
  await expectStatus('B4 ADMIN → /api/audit-logs', ['GET', '/api/audit-logs', cookies.admin], 200);
  await expectStatus('B5 STUDENT → POST /api/grades', ['POST', '/api/grades', cookies.student, {}], 403);
  await expectStatus('B6 PARENT → POST /api/events', ['POST', '/api/events', cookies.parent, {}], 403);
  await expectStatus('B7 STUDENT → POST /api/fees', ['POST', '/api/fees', cookies.student, {}], 403);
  await expectStatus('B8 PARENT → POST /api/users', ['POST', '/api/users', cookies.parent, {}], 403);
  const b9 = await expectStatus('B9 TEACHER → POST /api/periods (rôle OK, corps invalide)', [
    'POST',
    '/api/periods',
    cookies.teacher,
    {},
  ], [400, 422]);
  if (b9 && [401, 403].includes(b9.status)) record('B9 bis rôle TEACHER accepté', false, `HTTP ${b9.status}`);

  // ── C. Ownership ────────────────────────────────────────────────────────
  console.log('\nC. Périmètre de données (ownership)');
  const c1 = await expectStatus(
    'C1 STUDENT → GET /api/grades',
    ['GET', '/api/grades?schoolId=sch_demo_gradeup', cookies.student],
    200
  );
  expectData('C1 ses notes uniquement', c1, (j) =>
    Array.isArray(j?.grades) && j.grades.length > 0 && j.grades.every((g) => g.studentId === STUDENT_ID)
      ? true
      : `rows=${j?.grades?.length ?? '?'} foreign=${j?.grades?.filter((g) => g.studentId !== STUDENT_ID).length ?? '?'}`
  );
  const c2 = await expectStatus('C2 PARENT → GET /api/payments', ['GET', '/api/payments', cookies.parent], 200);
  expectData('C2 paiements des enfants uniquement', c2, (j) =>
    Array.isArray(j?.payments) &&
    j.payments.some((p) => p.studentId === CHILD_ID) &&
    j.payments.every((p) => PARENT_CHILD_IDS.has(p.studentId))
      ? true
      : `rows=${j?.payments?.length ?? '?'} foreign=${j?.payments?.filter((p) => p.studentId !== CHILD_ID).length ?? '?'}`
  );
  const c3 = await expectStatus('C3 PARENT → GET /api/absence-justifications', [
    'GET',
    '/api/absence-justifications',
    cookies.parent,
  ], 200);
  expectData('C3 justifications liées (fils/explication)', c3, (j) =>
    Array.isArray(j?.absenceJustifications) &&
    j.absenceJustifications.every(
      (x) => x.explainedById === PARENT_ID || x.studentId === CHILD_ID
    )
      ? true
      : 'lignes hors périmètre détectées'
  );
  const c4 = await expectStatus('C4 STUDENT → GET /api/notifications', ['GET', '/api/notifications', cookies.student], 200);
  expectData('C4 notifications personnelles/ciblées', c4, (j) =>
    Array.isArray(j?.notifications) &&
    j.notifications.every((n) => !n.userId || n.userId === STUDENT_ID)
      ? true
      : 'notifications destinées à un autre utilisateur'
  );
  const c5 = await expectStatus('C5 PARENT → GET /api/notification-preferences', [
    'GET',
    '/api/notification-preferences',
    cookies.parent,
  ], 200);
  expectData('C5 préférences propres', c5, (j) =>
    !j?.preference || j.preference.userId === PARENT_ID ? true : 'préférence d’un autre utilisateur'
  );

  // ── D. Escalade de privilèges + isolation multi-écoles ──────────────────
  console.log('\nD. Escalade & isolation');
  await expectStatus('D1 TEACHER modifie un ADMIN', [
    'PUT',
    `/api/users/${ADMIN_ID}`,
    cookies.teacher,
    { fullName: 'Piratage' },
  ], 403);
  await expectStatus('D2 STUDENT modifie un autre STUDENT', [
    'PUT',
    `/api/users/${OTHER_STUDENT_ID}`,
    cookies.student,
    { fullName: 'Piratage' },
  ], 403);
  const d3 = await expectStatus('D3 PARENT tente role=ADMIN sur lui-même', [
    'PUT',
    `/api/users/${PARENT_ID}`,
    cookies.parent,
    { role: 'ADMIN' },
  ], [403, 200]);
  if (d3 && d3.status === 200) {
    const check = await api('GET', `/api/users/${PARENT_ID}`, cookies.admin);
    expectData('D3 rôle PARENT inchangé après tentative', check, (j) =>
      j?.user?.role === 'PARENT' ? true : `role=${j?.user?.role}`
    );
  }

  // École 2 (registre indépendant) → ne doit rien voir de la démo.
  const secondIp = '10.99.0.1';
  const reg = await api(
    'POST',
    '/api/auth/register',
    null,
    {
      mode: 'create-school',
      schoolName: 'École Test Isolation',
      fullName: 'Admin Isolation',
      email: `isolation-${Date.now()}@test.cd`,
      password: PASSWORD,
    },
    secondIp
  );
  if ([200, 201].includes(reg.status)) {
    const secondCookie = (reg.headers.getSetCookie?.() || [])
      .find((c) => c.startsWith('gradeup_token='))
      ?.split(';')[0];
    if (secondCookie) {
      const d4 = await expectStatus('D4 Admin école 2 → utilisateur école démo', [
        'GET',
        `/api/users/${STUDENT_ID}`,
        secondCookie,
      ], [403, 404]);
      if (d4 && d4.status === 200) record('D4 isolation tenant', false, 'données d’une autre école exposées');
      const d5 = await expectStatus('D5 Admin école 2 → audit-logs école 2 (vide)', [
        'GET',
        '/api/audit-logs',
        secondCookie,
      ], 200);
      expectData('D5 aucun audit de la démo', d5, (j) =>
        Array.isArray(j?.auditLogs) && j.auditLogs.every((l) => l.schoolId !== 'sch_demo_gradeup')
          ? true
          : 'audit d’une autre école présent'
      );
    } else {
      record('D4/D5 isolation tenant', false, 'cookie de la 2ème école absent');
    }
  } else {
    record('D4/D5 isolation tenant', false, `inscription école 2 → HTTP ${reg.status} (rate limit ?)`);
  }

  // ── E. Sync push : allowlist ────────────────────────────────────────────
  console.log('\nE. Sync');
  const e1 = await expectStatus('E1 push entité hors allowlist refusée', [
    'POST',
    '/api/sync/push',
    cookies.student,
    {
      mutations: [
        {
          clientMutationId: `rbac-e1-${Date.now()}`,
          entity: 'users',
          operation: 'update',
          recordId: ADMIN_ID,
          payload: { role: 'ADMIN' },
          schoolId: 'sch_demo_gradeup',
          clientUpdatedAt: Date.now(),
          endpoint: `/api/users/${ADMIN_ID}`,
          method: 'PUT',
        },
      ],
    },
  ], [200, 207]);
  expectData('E1 mutation refusée (ok=false)', e1, (j) =>
    j?.results?.[0] && j.results[0].ok === false && j.results[0].status >= 400
      ? true
      : `results=${JSON.stringify(j?.results)?.slice(0, 120)}`
  );

  // ── F. Rate limiting login (5/15 min/IP) ────────────────────────────────
  console.log('\nF. Rate limiting');
  const rlIp = '10.55.0.1';
  let saw429 = false;
  let lastRetryAfter = null;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': rlIp },
      body: JSON.stringify({ inviteCode: INVITE, email: ACCOUNTS.admin.email, password: PASSWORD, isAdminLogin: true }),
    });
    if (res.status === 429) {
      saw429 = true;
      lastRetryAfter = res.headers.get('retry-after');
      break;
    }
  }
  record('F1 6ᵉ login même IP → 429 + Retry-After', saw429 && lastRetryAfter !== null, `Retry-After=${lastRetryAfter}`);

  // ── Bilan ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${passed === total ? '\x1b[32m' : '\x1b[31m'}${passed}/${total} contrôles d’autorisation validés\x1b[0m`);
  if (passed !== total) {
    console.log('\nÉchecs :');
    for (const r of results.filter((x) => !x.ok)) console.log(`  · ${r.name} — ${r.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});
