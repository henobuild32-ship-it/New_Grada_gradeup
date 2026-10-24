import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { auditFromRequest } from '@/lib/api/audit';
import { parseOrThrow, paymentSchema } from '@/lib/validation/entities';
import { assignReceiptNumber } from '@/lib/business/rules';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (!['ADMIN', 'CAISSIER', 'STUDENT', 'PARENT'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    // Multi-tenant : l'école vient TOUJOURS de la session (query ignorée).
    const schoolId = auth.schoolId;
    const studentId = searchParams.get('studentId');
    const status = searchParams.get('status');
    const month = searchParams.get('month');
    const classId = searchParams.get('classId');

    const querySchoolId = searchParams.get('schoolId');
    if (querySchoolId && querySchoolId !== auth.schoolId && auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'schoolId invalide' }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    const allowedStatuses = ['paid', 'pending', 'late', 'overdue', 'cancelled'];
    if (status && !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Statut de paiement invalide' }, { status: 400 });
    }

    if (studentId) {
      if (auth.role === 'PARENT') {
        const student = await db.user.findUnique({
          where: { id: studentId },
          select: { parentId: true, schoolId: true, role: true, deletedAt: true },
        });
        if (!student || student.deletedAt || student.role !== 'STUDENT' || student.parentId !== auth.userId || student.schoolId !== schoolId) {
          return NextResponse.json({ error: 'Vous ne pouvez consulter que les paiements de vos enfants' }, { status: 403 });
        }
      } else if (auth.role === 'STUDENT' && studentId !== auth.userId) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      where.studentId = studentId;
    } else if (auth.role === 'STUDENT') {
      where.studentId = auth.userId;
    } else if (auth.role === 'PARENT') {
      where.student = { is: { parentId: auth.userId, schoolId, role: 'STUDENT', deletedAt: null } };
    }
    if (status === 'late' || status === 'overdue') {
      where.OR = [
        { status: 'late' },
        { status: 'pending', createdAt: { lt: cutoff } },
      ];
    } else if (status === 'pending') {
      where.status = 'pending';
      where.createdAt = { gte: cutoff };
    } else if (status) {
      where.status = status;
    }
    if (month) where.month = month;
    if (classId && auth.role === 'ADMIN') {
      // Filtrer aux paiements des élèves inscrits dans cette classe
      where.student = { classEnrollments: { some: { classId } } };
    }

    const payments = await db.payment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            role: true,
            classEnrollments: { select: { class: { select: { id: true, name: true } } }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // GET is read-only: overdue is derived from age and never mutates rows or
    // emits notifications. A scheduled job can persist reminders separately.
    return NextResponse.json({
      payments: payments.map((payment) =>
        payment.status === 'pending' && payment.createdAt < cutoff
          ? { ...payment, status: 'late' }
          : payment
      ),
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    // Caisse : enregistrement réservé à l'administration de l'établissement.
    if (auth.role !== 'ADMIN' && auth.role !== 'CAISSIER') {
      return NextResponse.json({ error: 'Réservé à l’administration.', code: 'ROLE_FORBIDDEN' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = parseOrThrow(paymentSchema, body);
    const schoolId = auth.schoolId; // forcé : jamais depuis le corps

    // Vérifier que l'élève appartient à l'école.
    const student = await db.user.findUnique({
      where: { id: parsed.studentId },
      select: { id: true, schoolId: true, parentId: true, fullName: true, deletedAt: true },
    });
    if (!student || student.deletedAt || student.schoolId !== schoolId) {
      throw new ApiError('Élève introuvable dans votre établissement.', 404, 'STUDENT_NOT_FOUND');
    }

    const school = await db.school.findUnique({ where: { id: schoolId }, select: { currency: true } });
    const installment = parsed.installmentId
      ? await db.installment.findFirst({
          where: { id: parsed.installmentId, schoolId, studentId: parsed.studentId, deletedAt: null },
        })
      : null;
    if (parsed.installmentId && !installment) {
      throw new ApiError('Tranche introuvable pour cet élève.', 404, 'INSTALLMENT_NOT_FOUND');
    }
    if (installment && installment.status === 'PAID') {
      throw new ApiError('Cette tranche est déjà réglée.', 409, 'INSTALLMENT_ALREADY_PAID');
    }
    if (installment && parsed.status !== 'paid') {
      throw new ApiError('Une tranche ne peut être clôturée qu’avec un paiement confirmé.', 400, 'INSTALLMENT_REQUIRES_PAID');
    }
    if (installment && (Math.abs(parsed.amount - installment.amount) > 0.009 || (parsed.currency && parsed.currency !== installment.currency))) {
      throw new ApiError('Le montant et la devise doivent correspondre à la tranche sélectionnée.', 400, 'INSTALLMENT_AMOUNT_MISMATCH');
    }

    const currency = parsed.currency || installment?.currency || school?.currency || 'USD';
    // Le contrôle de tranche et l'attribution du reçu sont protégés contre les
    // doubles clics/requêtes concurrentes; l'unicité du reçu est également
    // garantie par l'index unique en base.
    let payment: (Awaited<ReturnType<typeof db.payment.create>> & {
      student: { id: string; fullName: string; parentId: string | null };
    }) | null = null;
    let receiptNumber = '';
    for (let attempt = 0; attempt < 5 && !payment; attempt++) {
      receiptNumber = await assignReceiptNumber(schoolId);
      try {
        payment = await db.$transaction(async (tx) => {
          const created = await tx.payment.create({
            data: {
              schoolId,
              studentId: parsed.studentId,
              amount: parsed.amount,
              status: parsed.status || 'pending',
              month: parsed.month || installment?.label || '',
              method: parsed.method || 'cash',
              currency,
              receiptNumber,
              academicYear: parsed.academicYear || '',
            },
            include: {
              student: { select: { id: true, fullName: true, parentId: true } },
            },
          });
          if (installment) {
            const claimed = await tx.installment.updateMany({
              where: {
                id: installment.id,
                schoolId,
                studentId: parsed.studentId,
                status: installment.status,
                paymentId: installment.paymentId,
              },
              data: { status: 'PAID', paidAt: new Date(), paymentId: created.id },
            });
            if (claimed.count !== 1) throw new ApiError('Cette tranche vient d’être réglée par une autre opération.', 409, 'INSTALLMENT_ALREADY_PAID');
          }
          return created;
        });
      } catch (error) {
        const uniqueCollision = typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
        if (!uniqueCollision || attempt === 4) throw error;
      }
    }
    if (!payment) throw new ApiError('Impossible d’attribuer un reçu unique. Réessayez.', 503, 'RECEIPT_NUMBER_UNAVAILABLE');

    // Audit (paiement = action sensible).
    await auditFromRequest(request, {
      schoolId,
      userId: auth.userId,
      action: 'PAYMENT_CREATE',
      entity: 'Payment',
      entityId: payment.id,
      after: {
        studentId: payment.studentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        receiptNumber: payment.receiptNumber,
      },
    });

    // Notify student and parent
    try {
      const { notifyUser } = await import('@/services/notifications/notificationEngine');
      const currencyLabel = payment.currency === 'CDF' ? 'FC' : '$';
      const amountStr = `${payment.amount} ${currencyLabel}`;
      const monthStr = payment.month ? ` (${payment.month})` : '';

      // Student
      notifyUser({
        schoolId,
        userId: payment.studentId,
        senderId: auth.userId,
        title: `💳 Reçu n° ${payment.receiptNumber ?? ''} : ${amountStr}`,
        message: `Paiement enregistré pour la scolarité${monthStr}. Statut : ${payment.status}`,
        type: 'PAYMENT',
        priority: 'NORMAL',
        metadata: { paymentId: payment.id, amount: payment.amount },
      }).catch((e) => console.error('[Payment] Student notification error:', e));

      // Parent
      if (payment.student?.parentId) {
        notifyUser({
          schoolId,
          userId: payment.student.parentId,
          senderId: auth.userId,
          title: `💳 Paiement scolarité (${payment.student.fullName})`,
          message: `Paiement de ${amountStr}${monthStr} enregistré (${payment.status}) — reçu ${payment.receiptNumber ?? ''}.`,
          type: 'PAYMENT',
          priority: 'NORMAL',
          metadata: { paymentId: payment.id, amount: payment.amount },
        }).catch((e) => console.error('[Payment] Parent notification error:', e));
      }
    } catch (e) {
      console.error('[Payment] Notification setup error:', e);
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
