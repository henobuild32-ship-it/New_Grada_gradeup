import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';

const CARD_PAYMENT_LABEL = 'Carte scolaire';

async function generateUniqueCardId(fullName: string) {
  const firstLetter = fullName.trim().charAt(0).toUpperCase() || 'X';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const baseId = `${firstLetter}${year}${month}`;

  let cardId = baseId;
  let counter = 1;
  while (true) {
    const existing = await db.user.findUnique({ where: { cardId } });
    if (!existing) {
      break;
    }
    cardId = `${baseId}${counter}`;
    counter++;
  }
  return cardId;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { schoolId, action, classId, userId } = await request.json();

    if (!schoolId || !action) {
      return NextResponse.json({ error: 'schoolId and action are required' }, { status: 400 });
    }

    // Admin uniquement, et admin de la même école
    if (auth.role !== 'ADMIN' || auth.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }

    const school = await db.school.findFirst({ where: { id: auth.schoolId, deletedAt: null }, select: { studentCardPriceCdf: true } });
    if (!school) return NextResponse.json({ error: 'École introuvable.' }, { status: 404 });
    const cardPriceCdf = school.studentCardPriceCdf;

    if (action === 'generate-all' || (action === 'generate-class' && classId)) {
      const whereClause: Record<string, any> = {
        schoolId,
        role: 'STUDENT',
        active: true,
        deletedAt: null,
        cardId: null, // generate only for those who don't have it
      };
      
      if (action === 'generate-class' && classId !== 'all') {
        if (classId === 'unassigned') {
          whereClause.classEnrollments = { none: {} };
        } else {
          const schoolClass = await db.schoolClass.findFirst({ where: { id: classId, schoolId, deletedAt: null }, select: { id: true } });
          if (!schoolClass) return NextResponse.json({ error: 'Classe introuvable dans votre école.' }, { status: 404 });
          whereClause.classEnrollments = { some: { classId } };
        }
      }

      const students = await db.user.findMany({ where: whereClause });
      const paidStudentIds = cardPriceCdf === 0 ? new Set(students.map((student) => student.id)) : new Set((await db.payment.findMany({
        where: { schoolId, studentId: { in: students.map((student) => student.id) }, month: CARD_PAYMENT_LABEL, status: 'paid', amount: cardPriceCdf, currency: 'CDF', deletedAt: null },
        select: { studentId: true },
        distinct: ['studentId'],
      })).map((payment) => payment.studentId));
      const eligibleStudents = students.filter((student) => paidStudentIds.has(student.id));
      const skippedUnpaid = students.length - eligibleStudents.length;
      let generatedCount = 0;
      for (const student of eligibleStudents) {
        const newCardId = await generateUniqueCardId(student.fullName);
        const issued = new Date().toISOString().slice(0, 10);
        const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await db.user.update({
          where: { id: student.id },
          data: {
            cardId: newCardId,
            cardIssuedDate: issued,
            cardExpiryDate: expiry,
          },
        });

        // 1. Notify Student in real-time
        try { await notifyUser({
          schoolId,
          userId: student.id,
          title: 'Carte Élève Générée 🆔',
          message: `Félicitations ! Votre carte d'identité scolaire GradeUp a été générée. Code : ${newCardId}`,
          type: 'CARD',
          priority: 'NORMAL',
          metadata: { cardId: newCardId, studentName: student.fullName },
        }); } catch (e) { console.error('[Cards] Student notification failed (non-blocking):', e); }

        // 2. Notify Parent if linked
        if (student.parentId) {
          try { await notifyUser({
            schoolId,
            userId: student.parentId,
            title: 'Carte Scolaire Enfant Disponible 🆔',
            message: `La carte d'identité scolaire GradeUp de votre enfant ${student.fullName} a été générée.`,
            type: 'CARD',
            priority: 'NORMAL',
            metadata: { cardId: newCardId, studentId: student.id, studentName: student.fullName },
          }); } catch (e) { console.error('[Cards] Parent notification failed (non-blocking):', e); }
        }

        generatedCount++;
      }
      return NextResponse.json({ success: true, generatedCount, skippedUnpaid });
    } else if (action === 'generate-single') {
      if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      const student = await db.user.findFirst({ where: { id: userId, schoolId, role: 'STUDENT', active: true, deletedAt: null } });
      if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      if (student.cardId) return NextResponse.json({ error: 'Une carte existe déjà pour cet élève.' }, { status: 409 });
      if (cardPriceCdf > 0) {
        const confirmedPayment = await db.payment.findFirst({
          where: { schoolId, studentId: student.id, month: CARD_PAYMENT_LABEL, status: 'paid', amount: cardPriceCdf, currency: 'CDF', deletedAt: null },
          select: { id: true },
        });
        if (!confirmedPayment) return NextResponse.json({ error: 'Le paiement complet de la carte doit être enregistré par la caisse avant son émission.' }, { status: 409 });
      }

      const newCardId = await generateUniqueCardId(student.fullName);
      const issued = new Date().toISOString().slice(0, 10);
      const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const updated = await db.user.update({
        where: { id: userId },
        data: { cardId: newCardId, cardIssuedDate: issued, cardExpiryDate: expiry },
        select: { id: true, fullName: true, role: true, cardId: true, cardIssuedDate: true, cardExpiryDate: true },
      });

      // 1. Notify Student in real-time
      try { await notifyUser({
        schoolId,
        userId: student.id,
        title: 'Carte Élève Générée 🆔',
        message: `Félicitations ! Votre carte d'identité scolaire GradeUp a été générée. Code : ${newCardId}`,
        type: 'CARD',
        priority: 'NORMAL',
        metadata: { cardId: newCardId, studentName: student.fullName },
      }); } catch (e) { console.error('[Cards] Student notification failed (non-blocking):', e); }

      // 2. Notify Parent if linked
      if (student.parentId) {
        try { await notifyUser({
          schoolId,
          userId: student.parentId,
          title: 'Carte Scolaire Enfant Disponible 🆔',
          message: `La carte d'identité scolaire GradeUp de votre enfant ${student.fullName} a été générée.`,
          type: 'CARD',
          priority: 'NORMAL',
          metadata: { cardId: newCardId, studentId: student.id, studentName: student.fullName },
        }); } catch (e) { console.error('[Cards] Parent notification failed (non-blocking):', e); }
      }

      return NextResponse.json({ success: true, user: updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
