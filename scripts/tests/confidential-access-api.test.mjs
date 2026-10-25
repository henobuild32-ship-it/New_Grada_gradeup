import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { signAccessToken, signRefreshToken } from '../../src/lib/auth/jwt.ts';
import { registerConfidentialUser } from '../../src/lib/confidential-access.ts';
import { hashPassword } from '../../src/lib/password.ts';

const db = new PrismaClient();
const baseUrl = process.env.GRADEUP_TEST_BASE_URL || 'http://127.0.0.1:3010';
const schoolIds = [];

function shortId() { return randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(); }

async function schoolFixture(label) {
  const suffix = shortId();
  const school = await db.school.create({
    data: {
      name: `Test Phase 3 ${label} ${suffix}`,
      email: `phase3-${suffix.toLowerCase()}@example.test`,
      password: await hashPassword('AdminPassword123!'),
      inviteCode: `ECOLE-${suffix.slice(0, 6)}`,
    },
  });
  schoolIds.push(school.id);
  const admin = await db.user.create({
    data: {
      schoolId: school.id,
      fullName: `Admin Test ${suffix}`,
      email: school.email,
      password: school.password,
      role: 'ADMIN',
      parentCode: `P-${suffix.slice(0, 6)}`,
    },
  });
  const token = signAccessToken({ sub: admin.id, schoolId: school.id, role: 'ADMIN', name: admin.fullName, authVersion: admin.authVersion });
  return { school, admin, token };
}

async function api(path, { method = 'GET', token, refreshToken, body, ip = `203.0.113.${Math.ceil(Math.random() * 200)}`, deviceId = randomUUID() } = {}) {
  const headers = { 'x-forwarded-for': ip };
  if (token) headers.cookie = `gradeup_token=${token}`;
  if (refreshToken) headers.cookie = `gradeup_refresh=${refreshToken}`;
  if (deviceId) headers['x-device-id'] = deviceId;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function adminCodes(fixture) {
  const result = await api('/api/admin/confidential-codes', { token: fixture.token });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return result.data.roles;
}

async function signup(fixture, role, code, name, options = {}) {
  const password = options.password || 'ReaderPassword123!';
  return api('/api/auth/register', {
    method: 'POST',
    ip: options.ip,
    deviceId: options.deviceId,
    body: {
      mode: 'join-school',
      inviteCode: fixture.school.inviteCode,
      fullName: name,
      email: options.email || `${shortId().toLowerCase()}@example.test`,
      password,
      role,
      gender: 'M',
      confidentialCode: code,
      deviceId: options.deviceId || randomUUID(),
    },
  });
}

test('Phase 3 privacy code API, caps, reset, rotation, throttling, and revocation', async (t) => {
  assert.ok(process.env.DATABASE_URL?.includes('127.0.0.1'), 'This integration suite must use a local disposable PostgreSQL database.');
  await db.$connect();
  t.after(async () => {
    for (const schoolId of schoolIds) await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
    await db.$disconnect();
  });

  const main = await schoolFixture('main');
  const mainCodes = await adminCodes(main);
  const readerCode = mainCodes.find((entry) => entry.role === 'LECTEUR').code;
  const cashierCode = mainCodes.find((entry) => entry.role === 'CAISSIER').code;

  await t.test('one code is bound to its role and school', async () => {
    const otherSchool = await schoolFixture('other-school');
    await adminCodes(otherSchool);
    const wrongRole = await signup(main, 'LECTEUR', cashierCode, 'Wrong Role Test');
    assert.equal(wrongRole.response.status, 400);
    assert.equal(wrongRole.data.error, "Ce code n'est pas valide ou a expiré. Demandez le code actuel à l'administrateur.");
    const otherSchoolAttempt = await signup({ ...otherSchool, token: otherSchool.token }, 'LECTEUR', readerCode, 'Wrong School Test');
    assert.equal(otherSchoolAttempt.response.status, 400);
    assert.equal(otherSchoolAttempt.data.error, wrongRole.data.error);
  });

  let firstReader;
  let secondReader;
  let firstCashier;
  await t.test('two readers and two cashiers are allowed independently; the third is refused', async () => {
    const r1 = await signup(main, 'LECTEUR', readerCode, 'Lecteur Un', { password: 'ReaderPassword123!', email: `reader1-${shortId()}@example.test` });
    assert.equal(r1.response.status, 201, JSON.stringify(r1.data));
    firstReader = r1.data.user;
    const r2 = await signup(main, 'LECTEUR', readerCode, 'Lecteur Deux', { email: `reader2-${shortId()}@example.test` });
    assert.equal(r2.response.status, 201, JSON.stringify(r2.data));
    secondReader = r2.data.user;
    const r3 = await signup(main, 'LECTEUR', readerCode, 'Lecteur Trois');
    assert.equal(r3.response.status, 409);
    assert.equal(r3.data.error, "Le nombre maximum de comptes est atteint pour ce rôle. Contactez l'administrateur de l'école.");

    const c1 = await signup(main, 'CAISSIER', cashierCode, 'Caissier Un', { email: `cash1-${shortId()}@example.test` });
    assert.equal(c1.response.status, 201, JSON.stringify(c1.data));
    firstCashier = c1.data.user;
    const c2 = await signup(main, 'CAISSIER', cashierCode, 'Caissier Deux', { email: `cash2-${shortId()}@example.test` });
    assert.equal(c2.response.status, 201, JSON.stringify(c2.data));
    const c3 = await signup(main, 'CAISSIER', cashierCode, 'Caissier Trois', { email: `cash3-${shortId()}@example.test` });
    assert.equal(c3.response.status, 409);
    const summary = await adminCodes(main);
    assert.equal(summary.find((entry) => entry.role === 'LECTEUR').count, 2);
    assert.equal(summary.find((entry) => entry.role === 'LECTEUR').suspended, true);
    assert.equal(summary.find((entry) => entry.role === 'CAISSIER').count, 2);
    assert.equal(summary.find((entry) => entry.role === 'CAISSIER').suspended, true);
  });

  await t.test('Reader can view school modules without personal secrets and has no write access', async () => {
    const readerToken = signAccessToken({ sub: firstReader.id, schoolId: main.school.id, role: 'LECTEUR', name: firstReader.fullName, authVersion: 0 });
    const audit = await api('/api/audit-logs', { token: readerToken });
    assert.equal(audit.response.status, 200, JSON.stringify(audit.data));
    assert.ok(Array.isArray(audit.data.logs));
    assert.ok(audit.data.logs.every((entry) => !('before' in entry) && !('after' in entry)));
    const reads = [
      `/api/users?schoolId=${main.school.id}`, `/api/classes?schoolId=${main.school.id}`,
      `/api/courses?schoolId=${main.school.id}`, `/api/attendance?schoolId=${main.school.id}`,
      `/api/payments?schoolId=${main.school.id}`, '/api/fees', '/api/tuition', '/api/card-pricing', '/api/stats',
      '/api/bulletins', '/api/schedules', '/api/calendar', '/api/coefficients', '/api/notification-preferences',
      `/api/conferences?schoolId=${main.school.id}`, '/api/passages', '/api/note-modifications',
      '/api/end-of-year', '/api/subject-rules', '/api/grading-rules', '/api/notifications',
    ];
    for (const path of reads) {
      const result = await api(path, { token: readerToken });
      assert.equal(result.response.status, 200, `${path}: ${result.response.status} ${JSON.stringify(result.data)}`);
    }
    const users = await api(`/api/users?schoolId=${main.school.id}`, { token: readerToken });
    assert.ok(Array.isArray(users.data.users));
    assert.ok(users.data.users.every((entry) => !('email' in entry) && !('phone' in entry) && !('parentCode' in entry)));

    const blockedWrites = [
      ['/api/classes', 'POST'], ['/api/courses', 'POST'], ['/api/attendance', 'POST'],
      ['/api/payments', 'POST'], ['/api/fees', 'POST'], ['/api/schedules', 'POST'],
      ['/api/calendar', 'POST'], ['/api/coefficients', 'POST'], ['/api/passages', 'POST'],
      ['/api/note-modifications', 'POST'], ['/api/grades', 'POST'], ['/api/users/cards', 'POST'],
      ['/api/card-pricing', 'PUT'], ['/api/ai', 'POST'], ['/api/ai/upload', 'POST'], ['/api/notification-preferences', 'PUT'],
      ['/api/notifications/phase4', 'PUT'], ['/api/notifications/broadcast-update', 'POST'],
      ['/api/admin/confidential-codes', 'POST'], ['/api/resources/phase4/favorite', 'POST'],
      ['/api/resources/phase4/favorite', 'DELETE'], ['/api/resources/upload', 'POST'], ['/api/upload/photo', 'POST'],
    ];
    for (const [path, method] of blockedWrites) {
      const result = await api(path, { method, token: readerToken, body: {} });
      assert.equal(result.response.status, 403, `${method} ${path}: ${result.response.status} ${JSON.stringify(result.data)}`);
    }
    const spoofedPdf = new FormData();
    spoofedPdf.append('file', new Blob(['not a PDF'], { type: 'application/pdf' }), 'faux.pdf');
    spoofedPdf.append('recipientId', main.admin.id);
    spoofedPdf.append('content', 'Contrôle de fichier');
    const rejectedUpload = await fetch(`${baseUrl}/api/upload/message`, {
      method: 'POST',
      headers: { cookie: `gradeup_token=${readerToken}`, 'x-forwarded-for': '203.0.113.202' },
      body: spoofedPdf,
    });
    const rejectedUploadData = await rejectedUpload.json().catch(() => ({}));
    assert.equal(rejectedUpload.status, 415, JSON.stringify(rejectedUploadData));

    const toAdmin = await api('/api/reader/messages', { method: 'POST', token: readerToken, body: { content: 'Test permission Lecteur' } });
    assert.equal(toAdmin.response.status, 201, JSON.stringify(toAdmin.data));

    const login = await api('/api/auth/login', {
      method: 'POST', ip: '203.0.113.201',
      body: { inviteCode: main.school.inviteCode, email: firstReader.email, password: 'ReaderPassword123!' },
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    assert.equal(login.data.user.role, 'LECTEUR');
    const refreshToken = signRefreshToken({ sub: firstReader.id, schoolId: main.school.id, role: 'LECTEUR', name: firstReader.fullName, authVersion: 0 });
    const refreshed = await api('/api/auth/refresh', { method: 'POST', refreshToken });
    assert.equal(refreshed.response.status, 200, JSON.stringify(refreshed.data));
    assert.equal(refreshed.data.user.id, firstReader.id);
    assert.match(refreshed.response.headers.get('set-cookie') || '', /gradeup_refresh=/);
  });

  await t.test('Payment routes are separated by role and a paid school card is required before issuance', async () => {
    const makeUser = async (role) => db.user.create({
      data: {
        schoolId: main.school.id,
        fullName: `Phase 4 ${role} ${shortId()}`,
        email: `${role.toLowerCase()}-${shortId().toLowerCase()}@example.test`,
        password: await hashPassword('Phase4Password123!'),
        role,
        parentCode: `P-${shortId().slice(0, 8)}`,
      },
    });
    const teacher = await makeUser('TEACHER');
    const parent = await makeUser('PARENT');
    const student = await makeUser('STUDENT');
    const roleToken = (user) => signAccessToken({ sub: user.id, schoolId: main.school.id, role: user.role, name: user.fullName, authVersion: user.authVersion ?? 0 });
    const paymentReaders = [
      ['ADMIN', main.token, 403], ['TEACHER', roleToken(teacher), 403],
      ['PARENT', roleToken(parent), 403], ['STUDENT', roleToken(student), 403],
      ['LECTEUR', roleToken(firstReader), 200], ['CAISSIER', roleToken(firstCashier), 200],
    ];
    for (const [role, token, expectedStatus] of paymentReaders) {
      const result = await api(`/api/payments?schoolId=${main.school.id}`, { token });
      assert.equal(result.response.status, expectedStatus, `${role} GET payments: ${JSON.stringify(result.data)}`);
    }
    const cashierClassAccess = await api(`/api/classes?schoolId=${main.school.id}`, { token: roleToken(firstCashier) });
    assert.equal(cashierClassAccess.response.status, 403, 'cashiers cannot access the class-management data route');
    const feeReaders = new Set(['LECTEUR', 'CAISSIER']);
    const tuitionReaders = new Set(['LECTEUR', 'CAISSIER', 'PARENT']);
    const cardPriceReaders = new Set(['ADMIN', 'LECTEUR', 'CAISSIER']);
    for (const [role, token] of paymentReaders) {
      for (const [path, allowed] of [
        ['/api/fees', feeReaders], ['/api/tuition', tuitionReaders], ['/api/card-pricing', cardPriceReaders],
      ]) {
        const result = await api(path, { token });
        assert.equal(result.response.status, allowed.has(role) ? 200 : 403, `${role} GET ${path}: ${JSON.stringify(result.data)}`);
      }
    }
    for (const [role, token] of paymentReaders.filter(([role]) => role !== 'CAISSIER')) {
      const result = await api('/api/payments', { method: 'POST', token, body: {} });
      assert.equal(result.response.status, 403, `${role} POST payments: ${JSON.stringify(result.data)}`);
    }

    const cashierToken = roleToken(firstCashier);
    const price = await api('/api/card-pricing', { method: 'PUT', token: cashierToken, body: { priceCdf: 3500 } });
    assert.equal(price.response.status, 200, JSON.stringify(price.data));
    const issueBeforePayment = await api('/api/users/cards', {
      method: 'POST', token: main.token,
      body: { schoolId: main.school.id, action: 'generate-single', userId: student.id },
    });
    assert.equal(issueBeforePayment.response.status, 409, JSON.stringify(issueBeforePayment.data));
    const payment = await api('/api/payments', {
      method: 'POST', token: cashierToken,
      body: { studentId: student.id, amount: 3500, currency: 'CDF', status: 'paid', month: 'Carte scolaire', method: 'cash' },
    });
    assert.equal(payment.response.status, 201, JSON.stringify(payment.data));
    assert.ok(payment.data.payment.receiptNumber);
    const issueAfterPayment = await api('/api/users/cards', {
      method: 'POST', token: main.token,
      body: { schoolId: main.school.id, action: 'generate-single', userId: student.id },
    });
    assert.equal(issueAfterPayment.response.status, 200, JSON.stringify(issueAfterPayment.data));
    assert.ok(issueAfterPayment.data.user.cardId);
    assert.equal('password' in issueAfterPayment.data.user, false, 'card API must never expose password hashes');
  });

  await t.test('school class and humanities setup stays tenant-scoped, warns on used records, and notifies affected users', async () => {
    const readerToken = signAccessToken({ sub: firstReader.id, schoolId: main.school.id, role: 'LECTEUR', name: firstReader.fullName, authVersion: 0 });
    const deniedReaderWrite = await api('/api/admin/humanities-structure', {
      method: 'POST', token: readerToken, body: { action: 'create-section', name: 'Lecteur ne peut pas créer' },
    });
    assert.equal(deniedReaderWrite.response.status, 403);

    const primarySection = await api('/api/admin/humanities-structure', {
      method: 'POST', token: main.token, body: { action: 'create-section', name: `Littéraire ${shortId()}` },
    });
    assert.equal(primarySection.response.status, 201, JSON.stringify(primarySection.data));
    const primarySectionId = primarySection.data.item.id;
    const primaryOption = await api('/api/admin/humanities-structure', {
      method: 'POST', token: main.token, body: { action: 'create-option', sectionId: primarySectionId, name: `Latin ${shortId()}` },
    });
    assert.equal(primaryOption.response.status, 201, JSON.stringify(primaryOption.data));

    const secondSection = await api('/api/admin/humanities-structure', {
      method: 'POST', token: main.token, body: { action: 'create-section', name: `Scientifique ${shortId()}` },
    });
    assert.equal(secondSection.response.status, 201, JSON.stringify(secondSection.data));
    const secondOption = await api('/api/admin/humanities-structure', {
      method: 'POST', token: main.token, body: { action: 'create-option', sectionId: secondSection.data.item.id, name: `Mathématiques ${shortId()}` },
    });
    assert.equal(secondOption.response.status, 201, JSON.stringify(secondOption.data));

    const foreign = await schoolFixture('foreign-humanities');
    const foreignSection = await api('/api/admin/humanities-structure', {
      method: 'POST', token: foreign.token, body: { action: 'create-section', name: 'Section étrangère' },
    });
    assert.equal(foreignSection.response.status, 201);
    const crossTenantOption = await api('/api/admin/humanities-structure', {
      method: 'POST', token: main.token, body: { action: 'create-option', sectionId: foreignSection.data.item.id, name: 'Option interdite' },
    });
    assert.equal(crossTenantOption.response.status, 404);
    const crossTenantDelete = await api('/api/admin/humanities-structure', {
      method: 'DELETE', token: main.token, body: { kind: 'section', id: foreignSection.data.item.id },
    });
    assert.equal(crossTenantDelete.response.status, 404);

    const teacher = await db.user.create({
      data: { schoolId: main.school.id, fullName: `Prof titulaire ${shortId()}`, email: `${shortId().toLowerCase()}@example.test`, password: await hashPassword('TeacherPassword123!'), role: 'TEACHER', parentCode: `P-${shortId().slice(0, 8)}` },
    });
    const parent = await db.user.create({
      data: { schoolId: main.school.id, fullName: `Parent test ${shortId()}`, email: `${shortId().toLowerCase()}@example.test`, password: await hashPassword('ParentPassword123!'), role: 'PARENT', parentCode: `P-${shortId().slice(0, 8)}` },
    });
    const student = await db.user.create({
      data: { schoolId: main.school.id, fullName: `Élève test ${shortId()}`, email: `${shortId().toLowerCase()}@example.test`, password: await hashPassword('StudentPassword123!'), role: 'STUDENT', parentId: parent.id, parentCode: `P-${shortId().slice(0, 8)}` },
    });
    const classResult = await api('/api/classes', {
      method: 'POST', token: main.token,
      body: { schoolId: main.school.id, name: `4e Humanités ${shortId()}`, level: 'Secondaire', cycle: 'Humanites', section: primarySection.data.item.name, option: primaryOption.data.item.name, titulaireId: teacher.id },
    });
    assert.equal(classResult.response.status, 201, JSON.stringify(classResult.data));
    const classId = classResult.data.class.id;
    await db.enrolledClass.create({ data: { userId: student.id, classId } });
    const teacherNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, userId: teacher.id, message: { contains: classResult.data.class.name } } });
    assert.ok(teacherNotice, 'the teacher receives the class titular assignment');

    const renamedSectionName = `Littéraire modifiée ${shortId()}`;
    const renameSection = await api('/api/admin/humanities-structure', {
      method: 'PATCH', token: main.token, body: { kind: 'section', id: primarySectionId, name: renamedSectionName },
    });
    assert.equal(renameSection.response.status, 200, JSON.stringify(renameSection.data));
    const renameParentNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, userId: parent.id, message: { contains: renamedSectionName } } });
    assert.ok(renameParentNotice, 'parents are notified when a used humanities section is renamed');

    const blockedOptionDelete = await api('/api/admin/humanities-structure', {
      method: 'DELETE', token: main.token, body: { kind: 'option', id: primaryOption.data.item.id },
    });
    assert.equal(blockedOptionDelete.response.status, 409);
    assert.equal(blockedOptionDelete.data.classes[0].id, classId);
    assert.equal(blockedOptionDelete.data.classes[0]._count.enrollments, 1);
    const blockedSectionDelete = await api('/api/admin/humanities-structure', {
      method: 'DELETE', token: main.token, body: { kind: 'section', id: primarySectionId },
    });
    assert.equal(blockedSectionDelete.response.status, 409);
    assert.equal(blockedSectionDelete.data.classes[0].id, classId);

    const classDelete = await api(`/api/classes/${classId}`, { method: 'DELETE', token: main.token });
    assert.equal(classDelete.response.status, 409, JSON.stringify(classDelete.data));
    assert.equal(classDelete.data.usage.enrollments, 1);

    const course = await api('/api/courses', {
      method: 'POST', token: main.token,
      body: { schoolId: main.school.id, classId, teacherId: teacher.id, name: `Mathématiques ${shortId()}` },
    });
    assert.equal(course.response.status, 201, JSON.stringify(course.data));
    const courseNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, userId: teacher.id, message: { contains: course.data.course.name } } });
    assert.ok(courseNotice, 'the teacher receives a course assignment notice');
    const replacementTeacher = await db.user.create({
      data: { schoolId: main.school.id, fullName: `Prof remplaçant ${shortId()}`, email: `${shortId().toLowerCase()}@example.test`, password: await hashPassword('TeacherPassword123!'), role: 'TEACHER', parentCode: `P-${shortId().slice(0, 8)}` },
    });
    const reassignedCourse = await api('/api/courses', {
      method: 'PUT', token: main.token,
      body: { id: course.data.course.id, teacherId: replacementTeacher.id },
    });
    assert.equal(reassignedCourse.response.status, 200, JSON.stringify(reassignedCourse.data));
    const removedCourseNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, userId: teacher.id, title: 'Cours retiré de votre attribution' } });
    const reassignedCourseNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, userId: replacementTeacher.id, title: 'Nouveau cours attribué' } });
    assert.ok(removedCourseNotice, 'the previous teacher is notified when a course is removed');
    assert.ok(reassignedCourseNotice, 'the new teacher is notified when a course is assigned');
    const readerCourseEdit = await api('/api/courses', {
      method: 'PUT', token: readerToken, body: { id: course.data.course.id, teacherId: teacher.id },
    });
    assert.equal(readerCourseEdit.response.status, 403);

    const updatedClass = await api(`/api/classes/${classId}`, {
      method: 'PUT', token: main.token,
      body: { name: classResult.data.class.name, level: 'Secondaire', cycle: 'Humanites', section: secondSection.data.item.name, option: secondOption.data.item.name },
    });
    assert.equal(updatedClass.response.status, 200, JSON.stringify(updatedClass.data));
    const studentNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, targetClassId: classId, targetRole: 'STUDENT', message: { contains: secondOption.data.item.name } } });
    const parentNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, userId: parent.id, message: { contains: secondOption.data.item.name } } });
    assert.ok(studentNotice, 'the affected class receives a student notice');
    assert.ok(parentNotice, 'linked parents receive a class-structure notice');

    const destination = await api('/api/classes', {
      method: 'POST', token: main.token,
      body: { schoolId: main.school.id, name: `5e EB ${shortId()}`, level: 'Secondaire', cycle: 'EB' },
    });
    assert.equal(destination.response.status, 201, JSON.stringify(destination.data));
    const transfer = await api('/api/classes/transfer', {
      method: 'POST', token: main.token,
      body: { studentIds: [student.id], fromClassId: classId, toClassId: destination.data.class.id },
    });
    assert.equal(transfer.response.status, 200, JSON.stringify(transfer.data));
    const transferParentNotice = await db.notification.findFirst({ where: { schoolId: main.school.id, userId: parent.id, message: { contains: destination.data.class.name } } });
    assert.ok(transferParentNotice, 'parents receive a notice after a student transfer');
  });

  await t.test('disabling one account frees its seat and revokes its session immediately', async () => {
    const single = await schoolFixture('single-seat');
    const code = (await adminCodes(single)).find((entry) => entry.role === 'LECTEUR').code;
    const created = await signup(single, 'LECTEUR', code, 'Lecteur à désactiver');
    assert.equal(created.response.status, 201);
    const token = signAccessToken({ sub: created.data.user.id, schoolId: single.school.id, role: 'LECTEUR', name: created.data.user.fullName, authVersion: 0 });
    const disabled = await api('/api/admin/confidential-codes', { method: 'PATCH', token: single.token, body: { userId: created.data.user.id, role: 'LECTEUR' } });
    assert.equal(disabled.response.status, 200, JSON.stringify(disabled.data));
    const revokedRequest = await api('/api/audit-logs', { token });
    assert.equal(revokedRequest.response.status, 403);
    const summary = await adminCodes(single);
    assert.equal(summary.find((entry) => entry.role === 'LECTEUR').count, 0);
    const replacement = await signup(single, 'LECTEUR', code, 'Lecteur remplaçant');
    assert.equal(replacement.response.status, 201, JSON.stringify(replacement.data));
  });

  await t.test('a code rotates after expiry while space remains and the old value is rejected', async () => {
    const rotation = await schoolFixture('rotation');
    const oldCode = (await adminCodes(rotation)).find((entry) => entry.role === 'LECTEUR').code;
    await db.confidentialAccessCode.update({
      where: { schoolId_role: { schoolId: rotation.school.id, role: 'LECTEUR' } },
      data: { rotateAt: new Date(Date.now() - 1000) },
    });
    const newCode = (await adminCodes(rotation)).find((entry) => entry.role === 'LECTEUR').code;
    assert.notEqual(newCode, oldCode);
    const stale = await signup(rotation, 'LECTEUR', oldCode, 'Ancien code');
    assert.equal(stale.response.status, 400);
    assert.equal(stale.data.error, "Ce code n'est pas valide ou a expiré. Demandez le code actuel à l'administrateur.");
    const current = await signup(rotation, 'LECTEUR', newCode, 'Nouveau code');
    assert.equal(current.response.status, 201, JSON.stringify(current.data));
  });

  await t.test('scheduled rotation rejects unauthenticated calls and rotates due codes without app traffic', async () => {
    const scheduled = await schoolFixture('scheduled-rotation');
    const previousCode = (await adminCodes(scheduled)).find((entry) => entry.role === 'LECTEUR').code;
    await db.confidentialAccessCode.update({
      where: { schoolId_role: { schoolId: scheduled.school.id, role: 'LECTEUR' } },
      data: { rotateAt: new Date(Date.now() - 1000) },
    });

    const endpoint = `${baseUrl}/api/cron/confidential-code-rotation`;
    const unauthenticated = await fetch(endpoint);
    assert.equal(unauthenticated.status, 401);
    const authorized = await fetch(endpoint, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const result = await authorized.json();
    assert.equal(authorized.status, 200, JSON.stringify(result));
    assert.ok(result.codesRotated >= 1);
    const currentCode = (await adminCodes(scheduled)).find((entry) => entry.role === 'LECTEUR').code;
    assert.notEqual(currentCode, previousCode);
  });

  await t.test('two simultaneous attempts for the last place produce exactly one account', async () => {
    const race = await schoolFixture('race');
    const code = (await adminCodes(race)).find((entry) => entry.role === 'LECTEUR').code;
    const first = await signup(race, 'LECTEUR', code, 'Lecteur initial');
    assert.equal(first.response.status, 201);
    const concurrent = await Promise.all([
      signup(race, 'LECTEUR', code, 'Lecteur concurrent A', { ip: '198.51.100.20' }),
      signup(race, 'LECTEUR', code, 'Lecteur concurrent B', { ip: '198.51.100.21' }),
    ]);
    assert.deepEqual(concurrent.map((result) => result.response.status).sort(), [201, 409]);
    const count = await db.user.count({ where: { schoolId: race.school.id, role: 'LECTEUR', active: true } });
    assert.equal(count, 2);
  });

  await t.test('repeated invalid attempts are limited and alert the administrator', async () => {
    const limited = await schoolFixture('rate-limit');
    const current = (await adminCodes(limited)).find((entry) => entry.role === 'LECTEUR').code;
    const ip = `198.51.100.${Math.ceil(Math.random() * 200)}`;
    const deviceId = `phase3-rate-test-${randomUUID()}`;
    const attempts = [];
    for (let index = 0; index < 6; index++) {
      attempts.push(await signup(limited, 'LECTEUR', `${current}X`, `Tentative ${index}`, { ip, deviceId }));
    }
    assert.deepEqual(attempts.slice(0, 5).map((result) => result.response.status), [400, 400, 400, 400, 400]);
    assert.equal(attempts[5].response.status, 429);
    assert.equal(attempts[5].data.error, 'Trop de tentatives. Réessayez plus tard.');
    const alert = await db.notification.findFirst({ where: { schoolId: limited.school.id, title: 'Tentatives d’inscription inhabituelles' } });
    assert.ok(alert);
    const logs = await db.auditLog.findMany({ where: { schoolId: limited.school.id, entity: 'ConfidentialAccessCode' } });
    assert.equal(logs.some((entry) => JSON.stringify(entry.after || {}).includes(current)), false);
  });

  await t.test('reset revokes accounts and tokens, replaces the code, and returns to 0/2', async () => {
    const oldReaderToken = signAccessToken({ sub: firstReader.id, schoolId: main.school.id, role: 'LECTEUR', name: firstReader.fullName, authVersion: 0 });
    const oldCashierToken = signAccessToken({ sub: firstCashier.id, schoolId: main.school.id, role: 'CAISSIER', name: firstCashier.fullName, authVersion: 0 });
    const resetReader = await api('/api/admin/confidential-codes', { method: 'POST', token: main.token, body: { action: 'reset', role: 'LECTEUR' } });
    assert.equal(resetReader.response.status, 200, JSON.stringify(resetReader.data));
    assert.notEqual(resetReader.data.role.code, readerCode);
    assert.equal(resetReader.data.role.count, 0);
    assert.equal((await api('/api/audit-logs', { token: oldReaderToken })).response.status, 403);
    const cashierStillActive = await api('/api/audit-logs', { token: oldCashierToken });
    assert.equal(cashierStillActive.response.status, 403, 'cashiers have no reader-only audit endpoint');
    const cashierUser = await db.user.findUnique({ where: { id: firstCashier.id } });
    assert.equal(cashierUser.active, true, 'resetting Readers must not affect Cashiers');
    const resetCashier = await api('/api/admin/confidential-codes', { method: 'POST', token: main.token, body: { action: 'reset', role: 'CAISSIER' } });
    assert.equal(resetCashier.response.status, 200, JSON.stringify(resetCashier.data));
    assert.equal((await db.user.findUnique({ where: { id: firstCashier.id } })).active, false);
    const summary = await adminCodes(main);
    assert.equal(summary.find((entry) => entry.role === 'LECTEUR').count, 0);
    assert.equal(summary.find((entry) => entry.role === 'CAISSIER').count, 0);
  });

  await t.test('reset waits for an in-flight registration and revokes that account when it commits', async () => {
    const inFlight = await schoolFixture('in-flight');
    const code = (await adminCodes(inFlight)).find((entry) => entry.role === 'LECTEUR').code;
    let release;
    let signalStarted;
    const hold = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const pendingSignup = db.$transaction(async (tx) => {
      const result = await registerConfidentialUser(tx, {
        schoolId: inFlight.school.id,
        role: 'LECTEUR',
        code,
        fullName: 'Inscription en cours',
        email: `inflight-${shortId()}@example.test`,
        passwordHash: 'test-hash',
        parentCode: `P-${shortId().slice(0, 6)}`,
        gender: 'M',
      });
      assert.ok('user' in result);
      signalStarted(result.user);
      await hold;
      return result;
    });
    const created = await started;
    const resetPromise = api('/api/admin/confidential-codes', { method: 'POST', token: inFlight.token, body: { action: 'reset', role: 'LECTEUR' } });
    await new Promise((resolve) => setTimeout(resolve, 250));
    release();
    await pendingSignup;
    const reset = await resetPromise;
    assert.equal(reset.response.status, 200, JSON.stringify(reset.data));
    const oldToken = signAccessToken({ sub: created.id, schoolId: inFlight.school.id, role: 'LECTEUR', name: created.fullName, authVersion: 0 });
    assert.equal((await api('/api/audit-logs', { token: oldToken })).response.status, 403);
    assert.equal((await db.user.findUnique({ where: { id: created.id } })).active, false);
  });
});
