import test from 'node:test';
import assert from 'node:assert/strict';
import {
  announcementMatchesViewer,
  describeAudience,
  normalizeAudience,
  validateAudience,
} from '../../src/lib/announcements/audience.ts';

test('normalizeAudience nettoie les doublons, les vides et les rôles inconnus', () => {
  const audience = normalizeAudience({
    audienceType: 'roles',
    targetRoles: ['TEACHER', 'TEACHER', 'INCONNU', 'PARENT', ''],
    targetClassIds: [' classe-a ', 'classe-a', 'classe-b'],
    targetUserIds: [' user-1 ', 'user-1'],
    contextClassId: ' classe-a ',
  });

  assert.equal(audience.audienceType, 'ROLES');
  assert.deepEqual(audience.targetRoles, ['TEACHER', 'PARENT']);
  assert.deepEqual(audience.targetClassIds, ['classe-a', 'classe-b']);
  assert.deepEqual(audience.targetUserIds, ['user-1']);
  assert.equal(audience.contextClassId, 'classe-a');
});

test('normalizeAudience retombe sur ALL pour un type inconnu', () => {
  const audience = normalizeAudience({ audienceType: 'N_IMPORTE_QUOI' });
  assert.equal(audience.audienceType, 'ALL');
  assert.deepEqual(audience.targetRoles, []);
  assert.deepEqual(audience.targetClassIds, []);
  assert.deepEqual(audience.targetUserIds, []);
});

test('validateAudience impose un destinataire selon le type choisi', () => {
  assert.equal(validateAudience(normalizeAudience({ audienceType: 'ALL' })), null);
  assert.match(
    validateAudience(normalizeAudience({ audienceType: 'ROLES' })),
    /rôle/i,
  );
  assert.match(
    validateAudience(normalizeAudience({ audienceType: 'CLASSES' })),
    /classe/i,
  );
  assert.match(
    validateAudience(normalizeAudience({ audienceType: 'STUDENTS', targetUserIds: ['e1'] })),
    /classe/i,
  );
  assert.equal(
    validateAudience(normalizeAudience({
      audienceType: 'STUDENTS',
      targetUserIds: ['e1'],
      contextClassId: 'c1',
    })),
    null,
  );
  assert.match(
    validateAudience(normalizeAudience({ audienceType: 'USERS' })),
    /personne/i,
  );
});

test('announcementMatchesViewer respecte tout le monde, le rôle et le destinataire direct', () => {
  const all = {
    audienceType: 'ALL',
    targetRoles: [],
    targetClassIds: [],
    targetUserIds: [],
  };
  assert.equal(announcementMatchesViewer(all, { role: 'CAISSIER', userId: 'u1' }), true);

  const roleTarget = {
    audienceType: 'ROLES',
    targetRoles: ['PARENT'],
    targetClassIds: [],
    targetUserIds: [],
  };
  assert.equal(announcementMatchesViewer(roleTarget, { role: 'PARENT', userId: 'u2' }), true);
  assert.equal(announcementMatchesViewer(roleTarget, { role: 'TEACHER', userId: 'u3' }), false);

  const directTarget = {
    audienceType: 'USERS',
    targetRoles: [],
    targetClassIds: [],
    targetUserIds: ['u4'],
  };
  assert.equal(announcementMatchesViewer(directTarget, { role: 'TEACHER', userId: 'u4' }), true);
  assert.equal(announcementMatchesViewer(directTarget, { role: 'TEACHER', userId: 'u5' }), false);
});

test('announcementMatchesViewer couvre les enfants et les classes', () => {
  const classTarget = {
    audienceType: 'CLASSES',
    targetRoles: [],
    targetClassIds: ['class-6a'],
    targetUserIds: [],
  };
  assert.equal(
    announcementMatchesViewer(classTarget, { role: 'STUDENT', userId: 's1', classIds: ['class-6a'] }),
    true,
  );
  assert.equal(
    announcementMatchesViewer(classTarget, { role: 'STUDENT', userId: 's2', classIds: ['class-6b'] }),
    false,
  );
  assert.equal(
    announcementMatchesViewer(classTarget, {
      role: 'PARENT',
      userId: 'p1',
      classIds: ['class-6a'],
      childIds: ['s1'],
    }),
    true,
  );

  const studentTarget = {
    audienceType: 'STUDENTS',
    targetRoles: [],
    targetClassIds: [],
    targetUserIds: ['s3'],
  };
  assert.equal(
    announcementMatchesViewer(studentTarget, { role: 'PARENT', userId: 'p2', childIds: ['s3'] }),
    true,
  );
  assert.equal(
    announcementMatchesViewer(studentTarget, { role: 'PARENT', userId: 'p3', childIds: ['s4'] }),
    false,
  );
});

test('describeAudience produit un résumé lisible en français', () => {
  assert.equal(
    describeAudience({
      audienceType: 'CLASSES',
      targetRoles: [],
      targetClassIds: ['c1', 'c2'],
      targetUserIds: [],
    }, { c1: '6A', c2: '6B' }),
    '6A, 6B (élèves et parents)',
  );
  assert.equal(
    describeAudience({
      audienceType: 'ROLES',
      targetRoles: ['TEACHER', 'PARENT'],
      targetClassIds: [],
      targetUserIds: [],
    }),
    'Professeurs, Parents',
  );
  assert.equal(
    describeAudience({
      audienceType: 'USERS',
      targetRoles: [],
      targetClassIds: [],
      targetUserIds: ['a', 'b', 'c'],
    }),
    '3 personne(s) sélectionnée(s)',
  );
});
