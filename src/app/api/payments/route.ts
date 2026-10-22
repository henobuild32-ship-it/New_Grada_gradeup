import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { auditFromRequest } from '@/lib/api/audit';
import { parseOrThrow, paymentSchema } from '@/lib/validation/entities';
import { assignReceiptNumber } from '@/lib/business/rules';

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
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

    const where: Record<string, unknown> = { schoolId };

    if (studentId) {
      if (auth.role === 'PARENT') {
        const student = await db.user.findUnique({
          where: { id: studentId },
          select: { parentId: true, schoolId: true },
        });
        if (!student || student.parentId !== auth.userId || student.schoolId !== schoolId) {
          return NextResponse.json({ error: 'Vous ne pouvez consulter que les paiements de vos enfants' }, { status: 403 });
        }
      } else if (auth.role === 'STUDENT' && studentId !== auth.userId) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      where.studentId = studentId;
    } else if (auth.role === 'STUDENT') {
      where.studentId = auth.userId;
    } else if (auth.role === 'PARENT') {
      where.student = { is: { parentId: auth.userId, schoolId } };
    }
    if (status) where.status = status;
    if (month) where.month = month;
    if (classId && auth.role === 'ADMIN') {
      // Filtrer aux paiements des élèves inscrits dans cette classe
      where.student = { classEnrollments: { some: { classId } } };
    }

    // ─── Règle métier : paiement en retard > 30 jours → statut LATE ───
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const overdue = await db.payment.findMany({
      where: {
        schoolId,
        status: 'pending',
        createdAt: { lt: cutoff },
        deletedAt: null,
      },
      select: { id: true, studentId: true },
      take: 200,
    });
    if (overdue.length > 0) {
      await db.payment.updateMany({
        where: { id: { in: overdue.map((p) => p.id) } },
        data: { status: 'late' },
      });
      // Notifier les élèves concernés (non bloquant)
      try {
        const { notifyUser } = await import('@/services/notifications/notificationEngine');
        for (const p of overdue) {
          notifyUser({
            schoolId,
            userId: p.studentId,
            senderId: auth.userId,
            title: '⚠️ Scolarité en retard',
            message: 'Un paiement en attente a plus de 30 jours de retard.',
            type: 'PAYMENT',
            priority: 'HIGH',
            metadata: { paymentId: p.id },
          }).catch(() => {});
        }
      } catch { /* notifications non bloquantes */ }
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

    return NextResponse.json({ payments });
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
    const auth = authenticateRequest(request);
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

    // Numéro de reçu UNIQUE attribué par le serveur (jamais par le client).
    const receiptNumber = await assignReceiptNumber(schoolId);

    const payment = await db.payment.create({
      data: {
        schoolId,
        studentId: parsed.studentId,
        amount: parsed.amount,
        status: parsed.status || 'pending',
        month: parsed.month || '',
        method: parsed.method || 'cash',
        currency: parsed.currency || 'USD',
        receiptNumber,
        academicYear: parsed.academicYear || '',
      },
      include: {
        student: { select: { id: true, fullName: true, parentId: true } },
      },
    });

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
