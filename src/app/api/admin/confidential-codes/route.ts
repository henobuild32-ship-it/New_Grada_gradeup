import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import {
  CONFIDENTIAL_CODE_TTL_MS,
  CONFIDENTIAL_ROLES,
  confidentialRole,
  decryptConfidentialCode,
  encryptConfidentialCode,
  generateConfidentialCode,
  hashConfidentialCode,
  lockConfidentialCode,
} from '@/lib/confidential-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('[confidential-codes] request failed', error);
  return NextResponse.json({ error: 'Une erreur est survenue. Réessayez.' }, { status: 500 });
}

async function requireAdmin(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.role !== 'ADMIN') throw new AuthError('Accès réservé à l’administrateur.', 403);
  return auth;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const now = new Date();
    const roles = await Promise.all(CONFIDENTIAL_ROLES.map(async (role) => {
      const state = await db.$transaction((tx) => lockConfidentialCode(tx, auth.schoolId, role, now));
      const accounts = await db.user.findMany({
        where: {
          schoolId: auth.schoolId,
          role,
          active: true,
          deletedAt: null,
          confidentialCodeGeneration: state.generation,
        },
        select: { id: true, fullName: true, createdAt: true, lastActivityAt: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        role,
        code: decryptConfidentialCode(state.encryptedCode),
        count: accounts.length,
        suspended: Boolean(state.suspendedAt),
        rotateAt: state.suspendedAt ? null : state.rotateAt.toISOString(),
        accounts: accounts.map((account) => ({
          id: account.id,
          fullName: account.fullName,
          createdAt: account.createdAt.toISOString(),
          lastActivityAt: account.lastActivityAt?.toISOString() ?? null,
        })),
      };
    }));
    return NextResponse.json({ roles, serverTime: now.toISOString() }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'reset' || !confidentialRole(body?.role)) {
      return NextResponse.json({ error: 'Action ou rôle invalide.' }, { status: 400 });
    }
    const role = body.role;
    const now = new Date();
    const reset = await db.$transaction(async (tx) => {
      const state = await lockConfidentialCode(tx, auth.schoolId, role, now);
      const revoked = await tx.user.findMany({
        where: { schoolId: auth.schoolId, role, active: true, deletedAt: null, confidentialCodeGeneration: state.generation },
        select: { id: true, fullName: true },
      });
      if (revoked.length) {
        await tx.user.updateMany({
          where: { id: { in: revoked.map((user) => user.id) }, schoolId: auth.schoolId, active: true },
          data: { active: false, authVersion: { increment: 1 } },
        });
      }
      const nextCode = generateConfidentialCode();
      const nextGeneration = state.generation + 1;
      await tx.confidentialAccessCode.update({
        where: { id: state.id },
        data: {
          codeHash: hashConfidentialCode(auth.schoolId, role, nextCode),
          encryptedCode: encryptConfidentialCode(nextCode),
          generation: nextGeneration,
          issuedAt: now,
          rotateAt: new Date(now.getTime() + CONFIDENTIAL_CODE_TTL_MS),
          suspendedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          schoolId: auth.schoolId,
          userId: auth.userId,
          action: 'CONFIDENTIAL_CODE_RESET',
          entity: 'ConfidentialAccessCode',
          entityId: role,
          before: { role, generation: state.generation, revokedAccounts: revoked.length },
          after: { role, generation: nextGeneration, activeAccounts: 0 },
        },
      });
      return { role, code: nextCode, count: 0, suspended: false, rotateAt: new Date(now.getTime() + CONFIDENTIAL_CODE_TTL_MS).toISOString(), accounts: [] };
    });
    return NextResponse.json({ role: reset }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (typeof body?.userId !== 'string' || !confidentialRole(body?.role)) {
      return NextResponse.json({ error: 'Compte invalide.' }, { status: 400 });
    }
    const role = body.role;
    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      const state = await lockConfidentialCode(tx, auth.schoolId, role, now);
      const target = await tx.user.findFirst({
        where: { id: body.userId, schoolId: auth.schoolId, role, active: true, deletedAt: null, confidentialCodeGeneration: state.generation },
        select: { id: true, fullName: true },
      });
      if (!target) return null;
      await tx.user.update({ where: { id: target.id }, data: { active: false, authVersion: { increment: 1 } } });
      await tx.auditLog.create({
        data: {
          schoolId: auth.schoolId,
          userId: auth.userId,
          action: 'CONFIDENTIAL_ACCOUNT_DISABLED',
          entity: 'ConfidentialAccessCode',
          entityId: role,
          before: { userId: target.id, role, active: true },
          after: { userId: target.id, role, active: false },
        },
      });
      return { id: target.id, name: target.fullName };
    });
    if (!result) return NextResponse.json({ error: 'Ce compte est déjà désactivé ou ne relève pas du code courant.' }, { status: 404 });
    return NextResponse.json({ ok: true, userId: result.id });
  } catch (error) {
    return errorResponse(error);
  }
}
