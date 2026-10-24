/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Seed de démonstration GradeUp — contexte RDC.
 *
 * Exécution :  npm run db:seed   (node prisma/seed.js)
 * Idempotent : supprime/recrée l'école de démo `sch_demo_gradeup` (cascade).
 *
 * Comptes de test (tous les rôles de l'application) :
 *   ADMIN    admin@gradeup.cd       / Demo1234!
 *   TEACHER  prof.kalala@gradeup.cd / Demo1234!
 *   STUDENT  gracia.mputu@student.cd / Demo1234!
 *   PARENT   parent.mputu@gradeup.cd / Demo1234!
 * (ci-dessous : prof Nsimba, élèves + parents — voir récapitulatif final)
 */
const { PrismaClient } = require('@prisma/client');
const { randomBytes, scrypt } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

const SCHOOL_ID = 'sch_demo_gradeup';
const YEAR = '2025-2026';
const NOW = new Date();

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}:${derived.toString('hex')}`;
}

function daysFromNow(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('— Seed GradeUp (RDC) —');

  // ── 0. Nettoyage de la démo précédente (cascade via School) ──────────────
  await prisma.school.delete({ where: { id: SCHOOL_ID } }).catch(() => {});

  const password = await hashPassword('Demo1234!');

  // ── 1. École + année + périodes ──────────────────────────────────────────
  const school = await prisma.school.create({
    data: {
      id: SCHOOL_ID,
      name: 'Institut La Grâce',
      email: 'admin@gradeup.cd',
      password,
      inviteCode: 'ECOLE-DEMO26',
      currency: 'USD',
      province: 'Kinshasa',
      city: 'Kinshasa',
      commune: 'Gombe',
      schoolCode: 'KS-GMB-0142',
      color: '#2563eb',
      academicYear: YEAR,
      heureArriveeScolaire: '07:30',
      subscriptionStatus: 'active',
      subscriptionExpiry: daysFromNow(365),
    },
  });

  const schoolYear = await prisma.schoolYear.create({
    data: { schoolId: SCHOOL_ID, year: YEAR, status: 'OPEN' },
  });

  const periods = [];
  for (const p of [
    { name: '1ère Période', code: 'P1', trimester: 1, start: '2025-09-15', end: '2025-11-30' },
    { name: 'Examen 1', code: 'EX1', trimester: 1, start: '2025-12-01', end: '2025-12-12' },
    { name: '2ème Période', code: 'P2', trimester: 2, start: '2026-01-05', end: '2026-02-28' },
    { name: '3ème Période', code: 'P3', trimester: 3, start: '2026-04-06', end: '2026-06-12' },
  ]) {
    periods.push(
      await prisma.period.create({
        data: {
          schoolId: SCHOOL_ID,
          name: p.name,
          code: p.code,
          trimester: p.trimester,
          startDate: p.start,
          endDate: p.end,
          schoolYearId: schoolYear.id,
          status: 'OPEN',
        },
      })
    );
  }

  // ── 2. Utilisateurs ──────────────────────────────────────────────────────
  const mkUser = (id, data) =>
    prisma.user.create({
      data: {
        id,
        schoolId: SCHOOL_ID,
        password,
        parentCode: `P-${id.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase().padStart(6, '0')}`,
        ...data,
      },
    });

  const admin = await mkUser('usr_demo_admin', {
    fullName: 'Directrice Mbombo',
    email: 'admin@gradeup.cd',
    role: 'ADMIN',
    gender: 'F',
    matricule: 'MAT-2025-1000',
    phone: '+243810000001',
    postName: 'Directeur',
  });

  await mkUser('usr_demo_cashier', {
    fullName: 'Mado Kasongo',
    email: 'caissier@gradeup.cd',
    role: 'CAISSIER',
    gender: 'F',
    matricule: 'MAT-2025-1005',
    phone: '+243810000006',
    postName: 'Caissière',
  });

  const tKalala = await mkUser('usr_demo_t_kalala', {
    fullName: 'Kalala Nsenga',
    email: 'prof.kalala@gradeup.cd',
    role: 'TEACHER',
    gender: 'M',
    matricule: 'MAT-2025-1001',
    specialty: 'Mathématiques',
    qualification: 'Licence en Mathématiques',
    phone: '+243810000002',
  });
  const tNsimba = await mkUser('usr_demo_t_nsimba', {
    fullName: 'Nsimba Ilunga',
    email: 'prof.nsimba@gradeup.cd',
    role: 'TEACHER',
    gender: 'F',
    matricule: 'MAT-2025-1002',
    specialty: 'Français',
    qualification: 'Master en Lettres',
    phone: '+243810000003',
  });
  const tTshibangu = await mkUser('usr_demo_t_tshibangu', {
    fullName: 'Tshibangu Mukendi',
    email: 'prof.tshibangu@gradeup.cd',
    role: 'TEACHER',
    gender: 'M',
    matricule: 'MAT-2025-1003',
    specialty: 'Sciences',
    phone: '+243810000004',
  });
  const tLumumba = await mkUser('usr_demo_t_lumumba', {
    fullName: 'Lumumba Kasongo',
    email: 'prof.lumumba@gradeup.cd',
    role: 'TEACHER',
    gender: 'M',
    matricule: 'MAT-2025-1004',
    specialty: 'Anglais',
    phone: '+243810000005',
  });

  // Classes (frais USD, titulaires)
  const c6A = await prisma.schoolClass.create({
    data: {
      id: 'cls_demo_6a',
      schoolId: SCHOOL_ID,
      name: '6ème A',
      level: '6ème',
      cycle: 'Primaire',
      fees: 250,
      titulaireId: tNsimba.id,
    },
  });
  const c7B = await prisma.schoolClass.create({
    data: {
      id: 'cls_demo_7b',
      schoolId: SCHOOL_ID,
      name: '7ème B',
      level: '7ème',
      cycle: 'Secondaire',
      fees: 300,
      titulaireId: tKalala.id,
    },
  });
  const c2H = await prisma.schoolClass.create({
    data: {
      id: 'cls_demo_2h',
      schoolId: SCHOOL_ID,
      name: '2ème Humanités A',
      level: '2ème',
      cycle: 'Humanites',
      section: 'Scientifique',
      fees: 400,
      titulaireId: tTshibangu.id,
    },
  });

  // Parents + élèves (liens)
  const parentDefs = [
    ['usr_demo_p_mputu', 'Mputu Kabeya', 'parent.mputu@gradeup.cd', 'F'],
    ['usr_demo_p_ngoy', 'Ngoy Tshibola', 'parent.ngoy@gradeup.cd', 'M'],
    ['usr_demo_p_kabila', 'Kabila Mwanza', 'parent.kabila@gradeup.cd', 'F'],
    ['usr_demo_p_badila', 'Badila Nkulu', 'parent.badila@gradeup.cd', 'M'],
  ];
  const parents = [];
  for (const [id, fullName, email, gender] of parentDefs) {
    parents.push(
      await mkUser(id, {
        fullName,
        email,
        role: 'PARENT',
        gender,
        parentCode: `P-DEMO${String(parents.length + 1).padStart(2, '0')}`,
        phone: `+24382000000${parents.length + 1}`,
      })
    );
  }

  const studentDefs = [
    ['usr_demo_s_mputu', 'Gracia Mputu', 'F', c6A.id, 0, 'gracia.mputu@student.cd'],
    ['usr_demo_s_ngoy', 'Patrick Ngoy', 'M', c6A.id, 1, 'patrick.ngoy@student.cd'],
    ['usr_demo_s_kabila', 'Sarah Kabila', 'F', c6A.id, 2, 'sarah.kabila@student.cd'],
    ['usr_demo_s_badila', 'Junior Badila', 'M', c6A.id, 3, 'junior.badila@student.cd'],
    ['usr_demo_s_mbuyi', 'Esther Mbuyi', 'F', c7B.id, 0, 'esther.mbuyi@student.cd'],
    ['usr_demo_s_tumba', 'David Tumba', 'M', c7B.id, 1, 'david.tumba@student.cd'],
    ['usr_demo_s_lobola', 'Naomi Lobola', 'F', c7B.id, 2, 'naomi.lobola@student.cd'],
    ['usr_demo_s_kanku', 'Josué Kanku', 'M', c7B.id, 3, 'josue.kanku@student.cd'],
    ['usr_demo_s_mwinga', 'Rachel Mwinga', 'F', c2H.id, 0, 'rachel.mwinga@student.cd'],
    ['usr_demo_s_ilunga', 'Daniel Ilunga', 'M', c2H.id, 1, 'daniel.ilunga@student.cd'],
    ['usr_demo_s_beya', 'Deborah Beya', 'F', c2H.id, 2, 'deborah.beya@student.cd'],
    ['usr_demo_s_kanyinda', 'Éric Kanyinda', 'M', c2H.id, 3, 'eric.kanyinda@student.cd'],
  ];
  const students = [];
  let matSeq = 1100;
  for (const [id, fullName, gender, classId, parentIdx, email] of studentDefs) {
    const s = await mkUser(id, {
      fullName,
      email,
      role: 'STUDENT',
      gender,
      matricule: `MAT-2025-${matSeq++}`,
      parentId: parents[parentIdx].id,
      birthDate: '2013-04-12',
      section: classId === c2H.id ? 'Scientifique' : '',
    });
    students.push({ ...s, classId });
  }

  // Titres/flags titulaire + inscriptions
  for (const t of [tKalala, tNsimba, tTshibangu]) {
    await prisma.user.update({ where: { id: t.id }, data: { isTitulaire: true } });
  }
  for (const s of students) {
    await prisma.enrolledClass.create({
      data: { userId: s.id, classId: s.classId },
    });
  }

  // ── 3. Cours (coefficient, maxima, volume horaire) + horaires ───────────
  const courseDefs = [
    // 6ème A
    ['crs_demo_6a_maths', c6A.id, tKalala.id, 'Mathématiques', 3, 20, 6],
    ['crs_demo_6a_fr', c6A.id, tNsimba.id, 'Français', 3, 20, 6],
    ['crs_demo_6a_sci', c6A.id, tTshibangu.id, 'Sciences', 2, 20, 4],
    ['crs_demo_6a_ang', c6A.id, tLumumba.id, 'Anglais', 2, 20, 4],
    // 7ème B
    ['crs_demo_7b_maths', c7B.id, tKalala.id, 'Mathématiques', 4, 20, 7],
    ['crs_demo_7b_fr', c7B.id, tNsimba.id, 'Français', 3, 20, 5],
    ['crs_demo_7b_sci', c7B.id, tTshibangu.id, 'Physique-Chimie', 3, 20, 5],
    // 2ème Hum A
    ['crs_demo_2h_maths', c2H.id, tKalala.id, 'Mathématiques', 5, 20, 8],
    ['crs_demo_2h_sci', c2H.id, tTshibangu.id, 'Biologie', 4, 20, 6],
    ['crs_demo_2h_fr', c2H.id, tNsimba.id, 'Français', 3, 20, 5],
    ['crs_demo_2h_ang', c2H.id, tLumumba.id, 'Anglais', 2, 20, 4],
  ];
  const courses = [];
  for (const [id, classId, teacherId, name, coefficient, maxScore, weeklyHours] of courseDefs) {
    courses.push(
      await prisma.course.create({
        data: { id, schoolId: SCHOOL_ID, classId, teacherId, name, coefficient, maxScore, weeklyHours },
      })
    );
  }

  // Horaires (détection de conflits : pas de chevauchement prof/classe)
  const daySlots = [
    ['crs_demo_6a_maths', 1, '07:30', '09:00', 'Salle A1'],
    ['crs_demo_6a_fr', 1, '09:15', '10:45', 'Salle A1'],
    ['crs_demo_7b_maths', 2, '07:30', '09:00', 'Salle B2'],
    ['crs_demo_7b_fr', 2, '09:15', '10:45', 'Salle B2'],
    ['crs_demo_2h_maths', 3, '07:30', '09:00', 'Labo 1'],
    ['crs_demo_2h_sci', 3, '09:15', '10:45', 'Labo 1'],
    ['crs_demo_6a_sci', 4, '07:30', '09:00', 'Salle A1'],
    ['crs_demo_2h_ang', 4, '09:15', '10:45', 'Salle C3'],
  ];
  for (const [courseId, dayOfWeek, startTime, endTime, room] of daySlots) {
    await prisma.courseSchedule.create({
      data: { schoolId: SCHOOL_ID, courseId, dayOfWeek, startTime, endTime, room },
    });
  }

  // ── 4. Leçons, devoirs, soumissions ──────────────────────────────────────
  const lesson = await prisma.lesson.create({
    data: {
      schoolId: SCHOOL_ID,
      courseId: 'crs_demo_6a_maths',
      teacherId: tKalala.id,
      title: 'Les fractions : addition et soustraction',
      content:
        "Objectif : maîtriser l'addition de fractions de même dénominateur puis de dénominateurs différents.\nMéthode : réduire au même dénominateur, additionner les numérateurs, simplifier.\nExercices p. 42, n° 1 à 6.",
      isPublished: true,
      publishedAt: daysFromNow(-7),
    },
  });
  const hw1 = await prisma.homework.create({
    data: {
      id: 'hw_demo_6a_maths_1',
      schoolId: SCHOOL_ID,
      courseId: 'crs_demo_6a_maths',
      teacherId: tKalala.id,
      title: 'Exercices de fractions',
      description: "Résoudre les exercices 1 à 5 p. 45. Démonstrations exigées.",
      dueDate: isoDate(daysFromNow(5)),
      isPublished: true,
    },
  });
  await prisma.homework.create({
    data: {
      id: 'hw_demo_6a_fr_1',
      schoolId: SCHOOL_ID,
      courseId: 'crs_demo_6a_fr',
      teacherId: tNsimba.id,
      title: 'Dictée : les accords du participe passé',
      description: 'Rédiger la dictée puis corriger les 10 phrases fournies.',
      dueDate: isoDate(daysFromNow(3)),
      isPublished: true,
    },
  });

  const sub1 = await prisma.submission.create({
    data: {
      schoolId: SCHOOL_ID,
      homeworkId: hw1.id,
      studentId: 'usr_demo_s_mputu',
      content: '1) 1/4 + 2/4 = 3/4  2) 2/3 + 1/6 = 5/6 ...',
      status: 'graded',
      score: 17,
      maxScore: 20,
      gradedAt: daysFromNow(-1),
      gradedBy: tKalala.id,
    },
  });
  await prisma.submission.create({
    data: {
      schoolId: SCHOOL_ID,
      homeworkId: hw1.id,
      studentId: 'usr_demo_s_ngoy',
      content: 'Mes exercices corrigés en pièce jointe.',
      status: 'submitted',
    },
  });

  // ── 5. Notes (période P1, coefficients) ─────────────────────────────────
  const gradeInputs = [
    // student, course, score (sur 20), période
    ['usr_demo_s_mputu', 'crs_demo_6a_maths', 15.5],
    ['usr_demo_s_mputu', 'crs_demo_6a_fr', 13],
    ['usr_demo_s_mputu', 'crs_demo_6a_sci', 16],
    ['usr_demo_s_mputu', 'crs_demo_6a_ang', 14],
    ['usr_demo_s_ngoy', 'crs_demo_6a_maths', 11],
    ['usr_demo_s_ngoy', 'crs_demo_6a_fr', 12.5],
    ['usr_demo_s_ngoy', 'crs_demo_6a_sci', 10],
    ['usr_demo_s_kabila', 'crs_demo_6a_maths', 17],
    ['usr_demo_s_kabila', 'crs_demo_6a_fr', 16],
    ['usr_demo_s_kabila', 'crs_demo_6a_sci', 15],
    ['usr_demo_s_badila', 'crs_demo_6a_maths', 9],
    ['usr_demo_s_badila', 'crs_demo_6a_fr', 11],
    ['usr_demo_s_mbuyi', 'crs_demo_7b_maths', 14],
    ['usr_demo_s_mbuyi', 'crs_demo_7b_fr', 15.5],
    ['usr_demo_s_tumba', 'crs_demo_7b_maths', 12],
    ['usr_demo_s_tumba', 'crs_demo_7b_sci', 13],
    ['usr_demo_s_mwinga', 'crs_demo_2h_maths', 16.5],
    ['usr_demo_s_mwinga', 'crs_demo_2h_sci', 18],
    ['usr_demo_s_ilunga', 'crs_demo_2h_maths', 10.5],
    ['usr_demo_s_ilunga', 'crs_demo_2h_fr', 12],
    ['usr_demo_s_beya', 'crs_demo_2h_maths', 13],
    ['usr_demo_s_kanyinda', 'crs_demo_2h_ang', 11.5],
  ];
  const grades = [];
  for (const [studentId, courseId, score] of gradeInputs) {
    const course = courses.find((c) => c.id === courseId);
    grades.push(
      await prisma.grade.create({
        data: {
          schoolId: SCHOOL_ID,
          courseId,
          studentId,
          teacherId: course.teacherId,
          score,
          maxScore: 20,
          trimester: '1',
          period: 'P1',
          typeEvaluation: 'Interrogation',
          evaluationDate: daysFromNow(-14),
          schoolYearId: schoolYear.id,
          status: 'DRAFT',
        },
      })
    );
  }
  // Snapshot pour le bulletin publié
  await prisma.gradeSnapshot.create({
    data: {
      schoolId: SCHOOL_ID,
      studentId: 'usr_demo_s_mputu',
      courseId: 'crs_demo_6a_maths',
      period: 'P1',
      trimester: '1',
      score: 15.5,
      maxScore: 20,
      coefficient: 3,
      sourceGradeId: grades[0].id,
    },
  });

  // ── 6. Présences (statut + source) ──────────────────────────────────────
  for (const s of students.slice(0, 6)) {
    await prisma.attendance.create({
      data: {
        schoolId: SCHOOL_ID,
        studentId: s.id,
        teacherId: s.classId === c6A.id ? tNsimba.id : tKalala.id,
        courseId: s.classId === c6A.id ? 'crs_demo_6a_fr' : 'crs_demo_7b_maths',
        date: isoDate(daysFromNow(-2)),
        status: 'present',
        source: 'QR',
      },
    });
  }
  const absentAtt = await prisma.attendance.create({
    data: {
      schoolId: SCHOOL_ID,
      studentId: 'usr_demo_s_badila',
      teacherId: tNsimba.id,
      courseId: 'crs_demo_6a_fr',
      date: isoDate(daysFromNow(-3)),
      status: 'absent',
      source: 'MANUAL',
    },
  });
  await prisma.absenceJustification.create({
    data: {
      id: 'just_demo_1',
      schoolId: SCHOOL_ID,
      attendanceId: absentAtt.id,
      studentId: 'usr_demo_s_badila',
      explainedById: parents[3].id,
      reason: 'Certificat médical : grippe sévère, arrêt de 2 jours recommandé par le médecin de quartier.',
      status: 'PENDING',
    },
  });

  // ── 7. Frais + tranches + paiements (reçus uniques) ─────────────────────
  const fee = await prisma.fee.create({
    data: {
      id: 'fee_demo_scolarite',
      schoolId: SCHOOL_ID,
      name: 'Frais de scolarité ' + YEAR,
      amount: 300,
      currency: 'USD',
      dueDate: '2025-10-15',
      cycle: 'ALL',
    },
  });
  let receiptSeq = 1;
  const receipts = [];
  const paymentDefs = [
    ['usr_demo_s_mputu', 150, 'paid', 'Octobre', 'cash', 'USD'],
    ['usr_demo_s_mputu', 150, 'paid', 'Novembre', 'mobile', 'USD'],
    ['usr_demo_s_ngoy', 75, 'paid', 'Octobre', 'cash', 'USD'],
    ['usr_demo_s_kabila', 300, 'paid', 'Année complète', 'virement', 'USD'],
    ['usr_demo_s_badila', 50, 'late', 'Octobre', 'cash', 'USD'],
    ['usr_demo_s_mbuyi', 100, 'paid', 'Octobre', 'mobile', 'USD'],
    ['usr_demo_s_mwinga', 200, 'paid', 'Octobre-Courant', 'cash', 'CDF'],
    ['usr_demo_s_ilunga', 120, 'pending', 'Courant', 'cash', 'USD'],
  ];
  for (const [studentId, amount, status, month, method, currency] of paymentDefs) {
    const receiptNumber = `REC-2026-${String(receiptSeq++).padStart(6, '0')}`;
    receipts.push(
      await prisma.payment.create({
        data: {
          schoolId: SCHOOL_ID,
          studentId,
          amount,
          status,
          month,
          method,
          currency,
          receiptNumber,
          academicYear: YEAR,
        },
      })
    );
  }
  // Tranches pour l'élève en attente
  await prisma.installment.create({
    data: {
      id: 'ins_demo_1',
      schoolId: SCHOOL_ID,
      feeId: fee.id,
      studentId: 'usr_demo_s_ilunga',
      label: 'Tranche 1 — Octobre',
      amount: 120,
      dueDate: isoDate(daysFromNow(7)),
      status: 'PENDING',
    },
  });

  // ── 8. Bulletins (double validation) ─────────────────────────────────────
  const bulletin = async (id, studentId, classId, status, extra = {}) =>
    prisma.bulletin.create({
      data: {
        id,
        studentId,
        classId,
        schoolId: SCHOOL_ID,
        term: 1,
        academicYear: YEAR,
        average: 13.5,
        mention: 'Bien',
        appreciation: 'Trimestre satisfaisant, continuez vos efforts.',
        gradesSnapshot: { demo: true, capturedAt: NOW.toISOString() },
        status,
        ...extra,
      },
    });
  await bulletin('bul_demo_mputu', 'usr_demo_s_mputu', c6A.id, 'PUBLISHED', {
    rank: 2,
    validatedByTitulaireId: tNsimba.id,
    validatedByAdminId: admin.id,
    validatedAt: daysFromNow(-2),
    publishedAt: daysFromNow(-1),
  });
  await bulletin('bul_demo_ngoy', 'usr_demo_s_ngoy', c6A.id, 'VALIDATED_TITULAIRE', {
    rank: 3,
    validatedByTitulaireId: tNsimba.id,
    validatedAt: daysFromNow(-1),
  });
  await bulletin('bul_demo_kabila', 'usr_demo_s_kabila', c6A.id, 'DRAFT', { rank: 1 });
  await bulletin('bul_demo_mwinga', 'usr_demo_s_mwinga', c2H.id, 'PENDING_ADMIN', {
    validatedByTitulaireId: tTshibangu.id,
    validatedAt: daysFromNow(-1),
  });

  // ── 9. Messages, événements, ressources, notifications ──────────────────
  await prisma.message.create({
    data: {
      schoolId: SCHOOL_ID,
      senderId: parents[0].id,
      recipientId: tNsimba.id,
      content: 'Bonjour Madame, Gracia sera absente demain pour un rendez-vous médical. Merci de votre compréhension.',
      messageType: 'text',
    },
  });
  await prisma.message.create({
    data: {
      schoolId: SCHOOL_ID,
      senderId: tNsimba.id,
      recipientId: parents[0].id,
      content: 'Bonjour, c’est noté. Je lui ferai le point de la leçon manquée. Bonne journée.',
      read: true,
    },
  });

  await prisma.event.create({
    data: {
      id: 'evt_demo_reunion',
      schoolId: SCHOOL_ID,
      title: 'Réunion des parents — fin de trimestre',
      description: 'Présentation des bulletins du 1er trimestre par les titulaires.',
      startsAt: daysFromNow(10),
      endsAt: daysFromNow(10),
      location: 'Aula de l’Institut',
      targetType: 'SCHOOL',
      createdById: admin.id,
    },
  });

  await prisma.ressource.create({
    data: {
      id: 'res_demo_cours',
      schoolId: SCHOOL_ID,
      title: 'Cours : les fractions (PDF)',
      description: 'Support de cours complet pour la 6ème A.',
      category: 'Mathématiques',
      type: 'FICHIER',
      fileUrl: '/uploads/demo/fractions.pdf',
      visibility: 'CLASS',
      targetClassId: c6A.id,
      createdById: tKalala.id,
    },
  });

  await prisma.notification.create({
    data: {
      schoolId: SCHOOL_ID,
      userId: parents[0].id,
      senderId: admin.id,
      title: '📣 Bulletin publié',
      message: 'Le bulletin du 1er trimestre de Gracia Mputu est disponible.',
      type: 'REPORT_CARD',
    },
  });
  await prisma.notification.create({
    data: {
      schoolId: SCHOOL_ID,
      targetRole: 'PARENT',
      title: '📅 Réunion des parents',
      message: 'Réunion le ' + isoDate(daysFromNow(10)) + ' à 15h à l’Aula.',
      type: 'EVENT',
    },
  });

  // Préférences + audit de démo
  await prisma.notificationPreference.create({
    data: { schoolId: SCHOOL_ID, userId: parents[0].id, inApp: true, push: true, email: false, sms: false },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        schoolId: SCHOOL_ID,
        userId: admin.id,
        action: 'BULLETIN_PUBLISH',
        entity: 'Bulletin',
        entityId: 'bul_demo_mputu',
        after: { status: 'PUBLISHED' },
      },
      {
        schoolId: SCHOOL_ID,
        userId: admin.id,
        action: 'PAYMENT_CREATE',
        entity: 'Payment',
        entityId: receipts[0].id,
        after: { amount: 150, receiptNumber: 'REC-2026-000001' },
      },
      {
        schoolId: SCHOOL_ID,
        userId: admin.id,
        action: 'USER_CREATE',
        entity: 'User',
        entityId: 'usr_demo_s_mputu',
        after: { role: 'STUDENT', matricule: 'MAT-2025-1100' },
      },
    ],
  });

  // ── 10. Règles de décision RDC (seuil de réussite configurable) ─────────
  await prisma.gradingDecisionRule.create({
    data: {
      id: 'gdr_demo_default',
      schoolId: SCHOOL_ID,
      classId: null,
      cycle: 'ALL',
      academicYear: YEAR,
      passPercentage: 50,
      retakeMinPercentage: 45,
      maxFailedCourses: 2,
    },
  });

  // ── Récapitulatif ────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.user.count({ where: { schoolId: SCHOOL_ID } }),
    prisma.course.count({ where: { schoolId: SCHOOL_ID } }),
    prisma.grade.count({ where: { schoolId: SCHOOL_ID } }),
    prisma.payment.count({ where: { schoolId: SCHOOL_ID } }),
    prisma.attendance.count({ where: { schoolId: SCHOOL_ID } }),
    prisma.bulletin.count({ where: { schoolId: SCHOOL_ID } }),
  ]);
  console.log(`✔ École « Institut La Grâce » (${SCHOOL_ID}) créée.`);
  console.log(`  users=${counts[0]} courses=${counts[1]} grades=${counts[2]} payments=${counts[3]} attendance=${counts[4]} bulletins=${counts[5]}`);
  console.log('\n— Comptes de démonstration (mot de passe : Demo1234!) —');
  console.log('  ADMIN    admin@gradeup.cd');
  console.log('  TEACHER  prof.kalala@gradeup.cd   (titulaire 7ème B)');
  console.log('  TEACHER  prof.nsimba@gradeup.cd   (titulaire 6ème A)');
  console.log('  CAISSIER caissier@gradeup.cd');
  console.log('  STUDENT  gracia.mputu@student.cd  (6ème A, fille de Mputu)');
  console.log('  PARENT   parent.mputu@gradeup.cd  (enfant : Gracia Mputu)');
  console.log('  Invite   ECOLE-DEMO26');
}

main()
  .catch((e) => {
    console.error('Seed en échec :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
