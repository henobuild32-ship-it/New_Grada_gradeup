import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';

const reminderSchema = z.object({
  action: z.literal('remind-parent'),
  studentId: z.string().trim().min(1),
}).strict();

function isOverdue(dueDate: string, status: string, today: string) {
  return status !== 'PAID' && Boolean(dueDate) && dueDate < today;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN' && auth.role !== 'PARENT') return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const isParent = auth.role === 'PARENT';
    const requestedStudentId = searchParams.get('studentId');
    const classId = isParent ? null : searchParams.get('classId');
    const search = isParent ? undefined : searchParams.get('search')?.trim();
    const status = searchParams.get('status');
    if (status && !['paid', 'partial', 'unpaid', 'overdue', 'no-fee'].includes(status)) {
      return NextResponse.json({ error: 'Filtre de paiement invalide.' }, { status: 400 });
    }

    if (isParent && requestedStudentId) {
      const linkedChild = await db.user.findFirst({
        where: { id: requestedStudentId, schoolId: auth.schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null },
        select: { id: true },
      });
      if (!linkedChild) return NextResponse.json({ error: 'Cet élève n’est pas associé à votre compte parent.' }, { status: 403 });
    }

    const students = await db.user.findMany({
      where: {
        schoolId: auth.schoolId,
        role: 'STUDENT',
        deletedAt: null,
        ...(isParent ? { parentId: auth.userId, active: true } : {}),
        ...(requestedStudentId ? { id: requestedStudentId } : {}),
        ...(classId ? { classEnrollments: { some: { classId, class: { schoolId: auth.schoolId, deletedAt: null } } } } : {}),
        ...(search ? { OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { matricule: { contains: search, mode: 'insensitive' } },
        ] } : {}),
      },
      select: {
        id: true,
        fullName: true,
        matricule: true,
        parentId: true,
        classEnrollments: {
          where: { class: { schoolId: auth.schoolId, deletedAt: null } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { classId: true, class: { select: { id: true, name: true, fees: true } } },
        },
        payments: {
          where: { schoolId: auth.schoolId, deletedAt: null, status: 'paid' },
          select: { id: true, amount: true, currency: true, status: true, month: true, method: true, createdAt: true, receiptNumber: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    const studentIds = students.map((student) => student.id);
    const visibleClassIds = Array.from(new Set(students.flatMap((student) => student.classEnrollments.map((item) => item.classId))));
    const [fees, installments, classes, school] = await Promise.all([
      db.fee.findMany({
        where: {
          schoolId: auth.schoolId,
          deletedAt: null,
          ...(classId ? { OR: [{ classId }, { classId: null }] } : {}),
          ...(isParent ? { OR: [{ classId: { in: visibleClassIds } }, { classId: null }] } : {}),
        },
        select: { id: true, classId: true, name: true, amount: true, currency: true, dueDate: true, cycle: true, isAnnual: true },
        orderBy: [{ classId: 'asc' }, { name: 'asc' }],
      }),
      studentIds.length ? db.installment.findMany({
        where: { schoolId: auth.schoolId, studentId: { in: studentIds }, deletedAt: null },
        select: { id: true, studentId: true, feeId: true, label: true, amount: true, currency: true, dueDate: true, status: true, paidAt: true, paymentId: true },
        orderBy: { dueDate: 'asc' },
      }) : Promise.resolve([]),
      isParent
        ? Promise.resolve([])
        : db.schoolClass.findMany({ where: { schoolId: auth.schoolId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.school.findUnique({ where: { id: auth.schoolId }, select: { currency: true } }),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const mapped = students.map((student) => {
      const enrollment = student.classEnrollments[0] ?? null;
      const studentInstallments = installments.filter((item) => item.studentId === student.id);
      const classFees = fees.filter((fee) => fee.classId === enrollment?.classId || fee.classId === null);
      const expectedFees = classFees.length
        ? classFees.map((fee) => ({ feeId: fee.id, name: fee.name, amount: fee.amount, currency: fee.currency, dueDate: fee.dueDate }))
        : enrollment?.class?.fees
          ? [{ feeId: null, name: 'Frais annuels de classe', amount: enrollment.class.fees, currency: school?.currency || 'USD', dueDate: '' }]
          : studentInstallments.map((item) => ({ feeId: item.feeId, name: item.label, amount: item.amount, currency: item.currency, dueDate: item.dueDate }));

      const linkedPaymentIds = new Set(studentInstallments.map((item) => item.paymentId).filter(Boolean));
      const paidByCurrency: Record<string, number> = {};
      for (const item of studentInstallments) {
        if (item.status === 'PAID') paidByCurrency[item.currency] = (paidByCurrency[item.currency] ?? 0) + item.amount;
      }
      for (const payment of student.payments) {
        if (!linkedPaymentIds.has(payment.id)) paidByCurrency[payment.currency] = (paidByCurrency[payment.currency] ?? 0) + payment.amount;
      }

      const expectedByCurrency: Record<string, number> = {};
      for (const fee of expectedFees) expectedByCurrency[fee.currency] = (expectedByCurrency[fee.currency] ?? 0) + fee.amount;
      const balances = Object.entries(expectedByCurrency).map(([currency, due]) => ({
        currency,
        due,
        paid: paidByCurrency[currency] ?? 0,
        remaining: Math.max(0, due - (paidByCurrency[currency] ?? 0)),
        coverage: due > 0 ? Math.min(100, Math.round(((paidByCurrency[currency] ?? 0) / due) * 100)) : 100,
      }));

      const hasOverdue = studentInstallments.some((item) => isOverdue(item.dueDate, item.status, today)) ||
        (!studentInstallments.length && expectedFees.some((fee) => isOverdue(fee.dueDate, 'PENDING', today) && (paidByCurrency[fee.currency] ?? 0) < fee.amount));
      const hasBalance = balances.some((balance) => balance.remaining > 0);
      const hasPaid = Object.values(paidByCurrency).some((amount) => amount > 0);
      const paymentStatus = !expectedFees.length ? 'no-fee' : !hasBalance ? 'paid' : hasOverdue ? 'overdue' : hasPaid ? 'partial' : 'unpaid';

      return {
        id: student.id,
        fullName: student.fullName,
        matricule: student.matricule,
        parentId: student.parentId,
        classId: enrollment?.classId ?? null,
        className: enrollment?.class?.name ?? 'Non assigné',
        paymentStatus,
        balances,
        fees: expectedFees,
        installments: studentInstallments.map((item) => ({ ...item, isOverdue: isOverdue(item.dueDate, item.status, today) })),
        lastPayment: student.payments[0] ?? null,
      };
    });

    const result = status ? mapped.filter((student) => student.paymentStatus === status) : mapped;
    return NextResponse.json({ students: result, fees, classes, updatedAt: new Date().toISOString() });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible de charger le suivi des frais.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Accès réservé à l’administration.' }, { status: 403 });

    const parsed = reminderSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Demande de rappel invalide.' }, { status: 400 });
    const student = await db.user.findFirst({
      where: { id: parsed.data.studentId, schoolId: auth.schoolId, role: 'STUDENT', deletedAt: null },
      select: { id: true, fullName: true, parentId: true },
    });
    if (!student) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });
    if (!student.parentId) return NextResponse.json({ error: 'Aucun parent n’est associé à cet élève.' }, { status: 409 });

    const { notifyUser } = await import('@/services/notifications/notificationEngine');
    await notifyUser({
      schoolId: auth.schoolId,
      userId: student.parentId,
      senderId: auth.userId,
      title: `Rappel des frais scolaires — ${student.fullName}`,
      message: `Veuillez consulter le solde scolaire de ${student.fullName} et contacter l’établissement pour toute question.`,
      type: 'PAYMENT',
      priority: 'NORMAL',
      metadata: { studentId: student.id, source: 'tuition-reminder' },
    });
    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'TUITION_REMINDER_SENT',
      entity: 'User',
      entityId: student.id,
      after: { parentId: student.parentId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible d’envoyer le rappel.' }, { status: 500 });
  }
}
