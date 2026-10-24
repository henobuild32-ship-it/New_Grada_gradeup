import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/password';
import { resetPasswordWithOtp, OTP_LENGTH } from '@/lib/otp';
import { setAuthCookies, serializeUser } from '@/lib/auth/session';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';
import { clientIp, rateLimitResponse } from '@/lib/api/rate-limit';
import { findPasswordRecoveryUser, getRecoveryIdentityKey } from '@/lib/auth/password-recovery';

export const runtime = 'nodejs';

/**
 * POST /api/auth/reset
 * Body: { email?, fullName?, inviteCode?, isAdminLogin?, code, newPassword }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const identity = body as Record<string, unknown>;
    const ipLimit = await persistentRateLimit(`password-reset:ip:${clientIp(request)}`, 5, 15 * 60 * 1000);
    const identityKey = getRecoveryIdentityKey(identity);
    const identityLimit = await persistentRateLimit(`password-reset:identity:${identityKey}`, 5, 15 * 60 * 1000);
    const limit = !ipLimit.ok ? ipLimit : identityLimit;
    if (!limit.ok) {
      return NextResponse.json(rateLimitResponse(limit.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      });
    }

    const code = typeof identity.code === 'string' ? identity.code.trim() : '';
    const newPassword = typeof identity.newPassword === 'string' ? identity.newPassword : '';

    const normalizedCode = String(code || '').trim();
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(normalizedCode)) {
      return NextResponse.json(
        { error: `Le code OTP doit contenir exactement ${OTP_LENGTH} chiffres.` },
        { status: 400 }
      );
    }
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' },
        { status: 400 }
      );
    }
    if (newPassword.length > 128) {
      return NextResponse.json({ error: 'Le mot de passe ne peut pas dépasser 128 caractères.' }, { status: 400 });
    }

    if (identityKey.endsWith(':')) {
      return NextResponse.json({ error: 'Informations de compte manquantes.' }, { status: 400 });
    }

    const user = await findPasswordRecoveryUser(identity);

    if (!user) {
      return NextResponse.json({ error: 'Code invalide ou expiré. Redemandez un nouveau code.' }, { status: 400 });
    }

    const newHash = await hashPassword(newPassword);
    const updatedUser = await resetPasswordWithOtp(user.id, normalizedCode, newHash);
    if (!updatedUser) {
      return NextResponse.json(
        { error: 'Code invalide ou expiré, ou déjà utilisé. Redemandez un nouveau code.' },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      message: 'Mot de passe réinitialisé avec succès.',
      user: serializeUser(updatedUser, updatedUser.school),
    });
    setAuthCookies(response, updatedUser, updatedUser.school);
    return response;
  } catch (error) {
    console.error('[ResetPassword] Erreur:', error);
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
