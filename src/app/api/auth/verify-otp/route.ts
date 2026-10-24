import { NextRequest, NextResponse } from 'next/server';
import { checkOtpCode, OTP_LENGTH } from '@/lib/otp';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';
import { clientIp, rateLimitResponse } from '@/lib/api/rate-limit';
import { findPasswordRecoveryUser, getRecoveryIdentityKey } from '@/lib/auth/password-recovery';

export const runtime = 'nodejs';

/**
 * POST /api/auth/verify-otp
 * Body: { email?, fullName?, inviteCode?, isAdminLogin?, code }
 * Vérifie l'OTP sans le consommer, pour permettre l'étape reset juste après.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const identity = body as Record<string, unknown>;
    const ipLimit = await persistentRateLimit(`password-verify:ip:${clientIp(request)}`, 10, 15 * 60 * 1000);
    const identityKey = getRecoveryIdentityKey(identity);
    const identityLimit = await persistentRateLimit(`password-verify:identity:${identityKey}`, 10, 15 * 60 * 1000);
    const limit = !ipLimit.ok ? ipLimit : identityLimit;
    if (!limit.ok) {
      return NextResponse.json(rateLimitResponse(limit.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }

    const normalizedCode = typeof identity.code === 'string' ? identity.code.trim() : '';

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(normalizedCode)) {
      return NextResponse.json(
        { error: `Le code OTP doit contenir exactement ${OTP_LENGTH} chiffres.` },
        { status: 400 }
      );
    }
    if (identityKey.endsWith(':')) {
      return NextResponse.json({ error: 'Informations de compte manquantes.' }, { status: 400 });
    }

    const user = await findPasswordRecoveryUser(identity);

    if (!user) {
      return NextResponse.json(
        { error: 'Code invalide ou expiré. Vérifiez vos informations ou demandez un nouveau code.' },
        { status: 400 }
      );
    }

    const ok = await checkOtpCode(user.id, normalizedCode);
    if (!ok) {
      return NextResponse.json(
        { error: 'Code invalide ou expiré. Réessayez ou redemandez un nouveau code.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[VerifyOtp] Erreur:', error);
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
