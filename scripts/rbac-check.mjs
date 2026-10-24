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
  await expectStatus('B10 TEACHER → GET /api/payments', ['GET', '/api/payments', cookies.teacher], 403);
  const b9 = await expectStatus('B9 TEACHER → POST /api/periods (rôle OK, corps invalide)', [
    'POST',
    '/api/periods',
    cookies.teacher,
    {},
  ], [400, 422]);
  if (b9 && [401, 403].includes(b9.status)) record('B9 bis rôle TEACHER accepté', false, `HTTP ${b9.status}`);

  // ── C. Ownership ────────────────────────────────────────────────────────
  console.log('\nC. Périmètre de données (ownership)');
  await expectStatus('C0 STUDENT ne consulte pas l’emploi du temps d’une autre classe', [
    'GET',
    '/api/schedules?schoolId=sch_demo_gradeup&classId=cls_demo_7b',
    cookies.student,
  ], 403);
  await expectStatus('C0b PARENT ne consulte pas une classe sans enfant inscrit', [
    'GET',
    '/api/schedules?schoolId=sch_demo_gradeup&classId=cls_hors_perimetre',
    cookies.parent,
  ], 403);
  const c0c = await expectStatus('C0c STUDENT consulte l’emploi du temps de sa classe', [
    'GET',
    '/api/schedules?schoolId=sch_demo_gradeup&classId=cls_demo_6a',
    cookies.student,
  ], 200);
  expectData('C0c aucune classe tierce dans les horaires élève', c0c, (rows) =>
    Array.isArray(rows) && rows.length > 0 && rows.every((schedule) => schedule?.course?.class?.id === 'cls_demo_6a')
      ? true
      : `réponse invalide ou horaires hors classe : ${Array.isArray(rows) ? rows.length : 'format incorrect'}`
  );
  const c0d = await expectStatus('C0d PARENT liste uniquement ses enfants sans filtre fourni', [
    'GET',
    '/api/users?schoolId=sch_demo_gradeup',
    cookies.parent,
  ], 200);
  expectData('C0d aucun compte ou code parent confidentiel dans la liste', c0d, (j) =>
    Array.isArray(j?.users) && j.users.length > 0 &&
    j.users.every((u) => PARENT_CHILD_IDS.has(u.id) && u.role === 'STUDENT' && !Object.hasOwn(u, 'password') && !Object.hasOwn(u, 'parentCode') && !Object.hasOwn(u, 'children'))
      ? true
      : 'un utilisateur hors enfant ou une donnée confidentielle est exposée'
  );
  await expectStatus('C0e PARENT ne peut pas usurper le filtre d’un autre parent', [
    'GET',
    '/api/users?schoolId=sch_demo_gradeup&role=STUDENT&parentId=usr_demo_p_ngoy',
    cookies.parent,
  ], 403);
  const c0f = await expectStatus('C0f STUDENT liste son profil uniquement', [
    'GET',
    '/api/users?schoolId=sch_demo_gradeup',
    cookies.student,
  ], 200);
  expectData('C0f aucun compte ni code parent confidentiel dans le profil', c0f, (j) =>
    Array.isArray(j?.users) && j.users.length === 1 && j.users[0].id === STUDENT_ID &&
    !Object.hasOwn(j.users[0], 'password') && !Object.hasOwn(j.users[0], 'parentCode')
      ? true
      : 'le profil élève contient un autre compte ou une donnée confidentielle'
  );
  const c0g = await expectStatus('C0g PARENT → endpoint dédié de ses enfants', [
    'GET',
    '/api/parent/children',
    cookies.parent,
  ], 200);
  expectData('C0g endpoint enfant sans secrets de compte', c0g, (j) =>
    Array.isArray(j?.children) && j.children.length > 0 && j.children.every((child) =>
      PARENT_CHILD_IDS.has(child.id) && !Object.hasOwn(child, 'password') && !Object.hasOwn(child, 'parentCode')
    )
      ? true
      : 'l’endpoint parent renvoie un enfant hors scope ou une donnée confidentielle'
  );
  await expectStatus('C0h TEACHER ne peut pas usurper un autre enseignant', [
    'GET',
    '/api/users?schoolId=sch_demo_gradeup&role=STUDENT&teacherId=usr_demo_t_nsimba',
    cookies.teacher,
  ], 403);
  await expectStatus('C0i TEACHER doit demander uniquement les élèves de ses classes', [
    'GET',
    '/api/users?schoolId=sch_demo_gradeup',
    cookies.teacher,
  ], 403);
  const c0j = await expectStatus('C0j TEACHER liste les élèves de ses cours', [
    'GET',
    `/api/users?schoolId=sch_demo_gradeup&role=STUDENT&teacherId=${TEACHER_ID}`,
    cookies.teacher,
  ], 200);
  expectData('C0j liste enseignant sans mot de passe ni code parent', c0j, (j) =>
    Array.isArray(j?.users) && j.users.length > 0 && j.users.every((u) =>
      u.role === 'STUDENT' && !Object.hasOwn(u, 'password') && !Object.hasOwn(u, 'parentCode')
    )
      ? true
      : 'liste enseignant hors rôle ou donnée confidentielle exposée'
  );
  await expectStatus(
    'C0k TEACHER ne consulte pas les notes du cours d’un autre professeur',
    ['GET', '/api/grades?schoolId=sch_demo_gradeup&courseId=crs_demo_6a_fr', cookies.teacher],
    403
  );
  await expectStatus(
    'C0l TEACHER ne peut pas usurper teacherId dans les notes',
    ['GET', '/api/grades?schoolId=sch_demo_gradeup&teacherId=usr_demo_t_nsimba', cookies.teacher],
    403
  );
  await expectStatus(
    'C0m TEACHER ne peut pas usurper teacherId dans les cours',
    ['GET', '/api/courses?schoolId=sch_demo_gradeup&teacherId=usr_demo_t_nsimba', cookies.teacher],
    403
  );
  await expectStatus(
    'C0n STUDENT ne consulte pas les cours d’une autre classe',
    ['GET', '/api/courses?schoolId=sch_demo_gradeup&classId=cls_demo_7b', cookies.student],
    403
  );
  await expectStatus(
    'C0o TEACHER ne consulte pas les leçons d’un autre professeur',
    ['GET', '/api/lessons?schoolId=sch_demo_gradeup&courseId=crs_demo_6a_fr', cookies.teacher],
    403
  );
  await expectStatus(
    'C0p STUDENT ne consulte pas les leçons d’une autre classe',
    ['GET', '/api/lessons?schoolId=sch_demo_gradeup&courseId=crs_demo_7b_maths', cookies.student],
    403
  );
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
  const c4b = await expectStatus('C4b STUDENT ne peut pas demander les notifications CAISSIER', [
    'GET',
    '/api/notifications?targetRole=CAISSIER',
    cookies.student,
  ], 200);
  expectData('C4b filtrage du paramètre targetRole', c4b, (payload) => {
    const rows = Array.isArray(payload) ? payload : payload?.notifications;
    return Array.isArray(rows) && rows.every((n) => n.targetRole !== 'CAISSIER' || n.userId === STUDENT_ID)
      ? true
      : 'notification destinée à la caisse exposée à un élève';
  });
  const notificationDraft = { schoolId: 'sch_demo_gradeup', message: 'Contrôle RBAC automatisé' };
  await expectStatus('C4c STUDENT ne peut pas diffuser une notification', [
    'POST', '/api/notifications', cookies.student, notificationDraft,
  ], 403);
  await expectStatus('C4d TEACHER ne peut pas diffuser une annonce école', [
    'POST', '/api/notifications', cookies.teacher, notificationDraft,
  ], 403);
  await expectStatus('C4e PARENT ne peut pas diffuser une annonce école', [
    'POST', '/api/notifications', cookies.parent, notificationDraft,
  ], 403);
  const c5 = await expectStatus('C5 PARENT → GET /api/notification-preferences', [
    'GET',
    '/api/notification-preferences',
    cookies.parent,
  ], 200);
  expectData('C5 préférences propres', c5, (j) =>
    !j?.preference || j.preference.userId === PARENT_ID ? true : 'préférence d’un autre utilisateur'
  );

  const generated = await api('POST', '/api/report-cards', cookies.admin, {
    schoolId: 'sch_demo_gradeup',
    studentId: STUDENT_ID,
    trimester: '1',
  });
  const generatedReportId = generated.status === 200 ? generated.json?.reportCard?.id : null;
  record('C6a ADMIN génère un bulletin depuis les cotations du seed', Boolean(generatedReportId), `HTTP ${generated.status}`);
  if (generatedReportId) {
    const directPublish = await api('PUT', '/api/report-cards', cookies.admin, {
      id: generatedReportId,
      status: 'published',
    });
    record('C6b ADMIN ne peut pas publier sans validation préalable', directPublish.status === 409, `HTTP ${directPublish.status}`);
    const teacherValidate = await api('PUT', '/api/report-cards', cookies.teacher, {
      id: generatedReportId,
      status: 'validated',
    });
    record('C6c TEACHER ne peut pas valider le statut administratif', teacherValidate.status === 403, `HTTP ${teacherValidate.status}`);
  }

  const c6 = await expectStatus('C6 STUDENT → GET /api/report-cards', [
    'GET',
    `/api/report-cards?schoolId=sch_demo_gradeup&studentId=${OTHER_STUDENT_ID}&status=draft`,
    cookies.student,
  ], 200);
  expectData('C6 bulletins publiés de l’élève uniquement', c6, (j) =>
    Array.isArray(j?.reportCards) && j.reportCards.every((r) => r.studentId === STUDENT_ID && r.status === 'published') &&
    (!generatedReportId || j.reportCards.every((r) => r.id !== generatedReportId))
      ? true
      : 'bulletin étranger ou non publié renvoyé'
  );
  const c7 = await expectStatus('C7 PARENT → GET /api/report-cards', [
    'GET',
    `/api/report-cards?schoolId=sch_demo_gradeup&studentId=${OTHER_STUDENT_ID}&status=draft`,
    cookies.parent,
  ], 200);
  expectData('C7 bulletins publiés des enfants uniquement', c7, (j) =>
    Array.isArray(j?.reportCards) && j.reportCards.every((r) => PARENT_CHILD_IDS.has(r.studentId) && r.status === 'published')
      ? true
      : 'bulletin d’un autre élève ou non publié renvoyé'
  );
  const c8 = await expectStatus('C8 STUDENT → GET /api/sync/pull', [
    'GET',
    '/api/sync/pull',
    cookies.student,
  ], 200);
  expectData('C8 synchro étudiant sans code parent ni bulletin non publié', c8, (j) =>
    Array.isArray(j?.entities?.users) &&
    j.entities.users.every((u) => u.id === STUDENT_ID && !Object.hasOwn(u, 'parentCode')) &&
    Array.isArray(j?.entities?.bulletins) && j.entities.bulletins.every((b) => b.studentId === STUDENT_ID && b.status === 'PUBLISHED')
      ? true
      : 'données hors périmètre ou bulletin non publié dans le delta'
  );
  const c9 = await expectStatus('C9 PARENT → GET /api/sync/pull', [
    'GET',
    '/api/sync/pull',
    cookies.parent,
  ], 200);
  expectData('C9 synchro parent limitée à ses enfants et bulletins publiés', c9, (j) =>
    Array.isArray(j?.entities?.users) &&
    j.entities.users.every((u) => PARENT_CHILD_IDS.has(u.id) && !Object.hasOwn(u, 'parentCode')) &&
    Array.isArray(j?.entities?.bulletins) && j.entities.bulletins.every((b) => PARENT_CHILD_IDS.has(b.studentId) && b.status === 'PUBLISHED')
      ? true
      : 'données hors périmètre ou bulletin non publié dans le delta'
  );
  const c10 = await expectStatus('C10 TEACHER → GET /api/sync/pull', [
    'GET',
    '/api/sync/pull',
    cookies.teacher,
  ], 200);
  expectData('C10 synchro professeur bornée à ses cours/classes', c10, (j) => {
    const classIds = new Set(j?.entities?.classes?.map((c) => c.id) || []);
    return Array.isArray(j?.entities?.users) &&
      j.entities.users.every((u) => (u.id === TEACHER_ID || u.role === 'STUDENT') && !Object.hasOwn(u, 'parentCode')) &&
      Array.isArray(j?.entities?.bulletins) && j.entities.bulletins.every((b) => classIds.has(b.classId))
      ? true
      : 'données hors cours/classe ou code parent transmis';
  });
  await expectStatus('C11 TEACHER filtre une classe non attribuée', [
    'GET',
    '/api/report-cards?schoolId=sch_demo_gradeup&classId=classe-hors-perimetre',
    cookies.teacher,
  ], 403);

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
      await expectStatus('D6 Admin école 2 ne génère pas le code parent d’un élève externe', [
        'POST',
        '/api/parent-code',
        secondCookie,
        { userId: STUDENT_ID },
      ], 404);
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
  const e2 = await expectStatus('E2 relais sync refuse un hôte externe', [
    'POST',
    '/api/sync/push',
    cookies.student,
    {
      mutations: [
        {
          clientMutationId: '6eac77a3-cacb-4c06-9a4e-95b6d9a0a44e',
          entity: 'grades',
          operation: 'create',
          recordId: 'offline-grade-test',
          payload: {},
          schoolId: 'sch_demo_gradeup',
          clientUpdatedAt: Date.now(),
          endpoint: 'https://example.invalid/api/grades',
          method: 'POST',
        },
      ],
    },
  ], [200, 207]);
  expectData('E2 SSRF / fuite de cookie bloquées', e2, (j) =>
    j?.results?.[0]?.ok === false && j.results[0].status === 400
      ? true
      : `results=${JSON.stringify(j?.results)?.slice(0, 120)}`
  );
  const e3 = await expectStatus('E3 push sync refuse un autre schoolId', [
    'POST',
    '/api/sync/push',
    cookies.student,
    {
      mutations: [
        {
          clientMutationId: '4f327381-5370-45c2-a45b-3df4b9600f74',
          entity: 'grades',
          operation: 'create',
          recordId: 'offline-grade-tenant-test',
          payload: {},
          schoolId: 'school-foreign',
          clientUpdatedAt: Date.now(),
          endpoint: '/api/grades',
          method: 'POST',
        },
      ],
    },
  ], [200, 207]);
  expectData('E3 isolation tenant conservée au push', e3, (j) =>
    j?.results?.[0]?.ok === false && j.results[0].status === 400
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
