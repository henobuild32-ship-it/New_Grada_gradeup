import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { notificationPreferenceSchema, parseOrThrow } from '@/lib/validation/entities';

export const runtime = 'nodejs';

const DEFAULT_PREFERENCE = {
  inApp: true,
  push: true,
  email: false,
  sms: false,
  mutedTypes: [] as string[],
};

function shape(p: {
  id: string;
  userId: string;
  schoolId: string;
  inApp: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  mutedTypes: string;
}) {
  let muted: string[] = [];
  try {
    const parsed = JSON.parse(p.mutedTypes || '[]');
    if (Array.isArray(parsed)) muted = parsed.filter((m) => typeof m === 'string');
  } catch {
    muted = [];
  }
  return {
    id: p.id,
    userId: p.userId,
    schoolId: p.schoolId,
    inApp: p.inApp,
    push: p.push,
    email: p.email,
    sms: p.sms,
    mutedTypes: muted,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const pref = await db.notificationPreference.findUnique({ where: { userId: auth.userId } });
    if (!pref) {
      return ok('preference', { userId: auth.userId, schoolId: auth.schoolId, ...DEFAULT_PREFERENCE });
    }
    return ok('preference', shape(pref));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json();
    const data = parseOrThrow(notificationPreferenceSchema, body);

    const mutedTypes = JSON.stringify(data.mutedTypes ?? []);

    const pref = await db.notificationPreference.upsert({
      where: { userId: auth.userId },
      update: {
        ...(data.inApp !== undefined && { inApp: data.inApp }),
        ...(data.push !== undefined && { push: data.push }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.sms !== undefined && { sms: data.sms }),
        ...(data.mutedTypes !== undefined && { mutedTypes }),
      },
      create: {
        schoolId: auth.schoolId,
        userId: auth.userId,
        inApp: data.inApp ?? true,
        push: data.push ?? true,
        email: data.email ?? false,
        sms: data.sms ?? false,
        mutedTypes,
      },
    });

    return ok('preference', shape(pref));
  } catch (e) {
    return handleApiError(e);
  }
}
