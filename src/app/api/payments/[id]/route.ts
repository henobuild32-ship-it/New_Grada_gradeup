import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { z } from 'zod';

const paymentUpdateSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  status: z.enum(['paid', 'pending', 'late', 'overdue', 'cancelled']).optional(),
  month: z.string().max(40).optional(),
  method: z.enum(['cash', 'mobile', 'virement', 'cheque']).optional(),
  currency: z.enum(['USD', 'CDF', 'EUR']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Aucun champ à mettre à jour.');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequestActive(request);
    const { id } = await params;

    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, fullName: true, role: true, schoolId: true, parentId: true },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (payment.schoolId !== auth.schoolId) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    if (auth.role === 'STUDENT' && payment.studentId !== auth.userId) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    if (auth.role === 'PARENT' && payment.student?.parentId !== auth.userId) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    if (!['ADMIN', 'CAISSIER', 'STUDENT', 'PARENT'].includes(auth.role)) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });

    return NextResponse.json({ payment });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequestActive(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = paymentUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Modification invalide.', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const existing = await db.payment.findUnique({
      where: { id },
      include: { student: { select: { schoolId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Admin uniquement, et admin de la même école
    if (auth.role !== 'ADMIN' || existing.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }

    const payment = await db.payment.update({
      where: { id },
      data: {
        ...parsed.data,
      },
      include: {
        student: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'PAYMENT_CORRECTION',
      entity: 'Payment',
      entityId: id,
      before: existing,
      after: payment,
    });

    return NextResponse.json({ payment });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequestActive(request);
    const { id } = await params;

    const existing = await db.payment.findUnique({
      where: { id },
      include: { student: { select: { schoolId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Admin uniquement, et admin de la même école
    if (auth.role !== 'ADMIN' || existing.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }

    await db.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'PAYMENT_VOID',
      entity: 'Payment',
      entityId: id,
      before: existing,
    });

    return NextResponse.json({ message: 'Paiement annulé et conservé dans l’audit.' });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ApiError) return handleApiError(error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
