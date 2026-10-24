import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { normalizeInviteCode, isInviteCodeWellFormed } from '@/lib/code-format';
import { clientIp } from '@/lib/api/rate-limit';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const inviteCode = searchParams.get('inviteCode');

    // Backwards-compatible school lookup. Invite codes only reveal the public
    // school name and ID; registration uses the dedicated, rate-limited route.
    if (inviteCode) {
      const ip = clientIp(request);
      const ipLimit = await persistentRateLimit(`config-school-code:ip:${ip}`, 20, 60_000);
      if (!ipLimit.ok) {
        return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, {
          status: 429,
          headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
        });
      }
      const normalizedCode = normalizeInviteCode(inviteCode);
      if (!isInviteCodeWellFormed(normalizedCode)) return NextResponse.json({ school: null });
      const school = await db.school.findUnique({
        where: { inviteCode: normalizedCode },
        select: { id: true, name: true },
      });
      if (!school) {
        return NextResponse.json({ school: null });
      }
      return NextResponse.json({ school });
    }

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
    }

    authenticateRequestActive(request);

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        email: true,
        currency: true,
        inviteCode: true,
        logoUrl: true,
        color: true,
        academicYear: true,
        heureArriveeScolaire: true,
        province: true,
        city: true,
        commune: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
      },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    return NextResponse.json({ config: school });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const { schoolId, currency, name, email, logoUrl, latitude, longitude, heureArriveeScolaire, province, city, commune, academicYear } = body;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
    }
    if (auth.role !== 'ADMIN' || auth.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const existing = await db.school.findUnique({ where: { id: schoolId } });
    if (!existing) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const school = await db.school.update({
      where: { id: schoolId },
      data: {
        ...(currency !== undefined && { currency }),
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(latitude !== undefined && { latitude: latitude === '' || latitude === null ? null : parseFloat(String(latitude)) }),
        ...(longitude !== undefined && { longitude: longitude === '' || longitude === null ? null : parseFloat(String(longitude)) }),
        ...(province !== undefined && { province }),
        ...(city !== undefined && { city }),
        ...(commune !== undefined && { commune }),
        ...(academicYear !== undefined && { academicYear }),
        ...(heureArriveeScolaire !== undefined && { heureArriveeScolaire: /^([01]\d|2[0-3]):[0-5]\d$/.test(heureArriveeScolaire) ? heureArriveeScolaire : existing.heureArriveeScolaire }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        currency: true,
        inviteCode: true,
        logoUrl: true,
        province: true,
        city: true,
        commune: true,
        academicYear: true,
        heureArriveeScolaire: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ config: school, school });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
