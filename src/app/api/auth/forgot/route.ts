import { NextRequest, NextResponse } from 'next/server';
import { createAndSendOtp, OtpDeliveryError } from '@/lib/otp';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';
import { clientIp, rateLimitResponse } from '@/lib/api/rate-limit';
import { isEmailConfigured } from '@/lib/email';
import { findPasswordRecoveryUser, getRecoveryIdentityKey } from '@/lib/auth/password-recovery';

export const runtime = 'nodejs';

const GENERIC_SUCCESS_MESSAGE =
  'Si un compte correspond à ces informations, vous recevrez un code à 6 chiffres par e-mail. Vérifiez aussi vos courriers indésirables.';

/**
 * POST /api/auth/forgot
 * Body: { email?, fullName?, inviteCode?, isAdminLogin? }
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimit = await persistentRateLimit(`password-forgot:ip:${clientIp(request)}`, 5, 15 * 60 * 1000);
    if (!ipLimit.ok) {
      return NextResponse.json(rateLimitResponse(ipLimit.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const identity = body as Record<string, unknown>;
    const identityKey = getRecoveryIdentityKey(identity);
    if (identityKey.endsWith(':')) {
      return NextResponse.json(
        { error: 'Veuillez fournir votre email ou votre nom complet.' },
        { status: 400 }
      );
    }

    const identityLimit = await persistentRateLimit(`password-forgot:identity:${identityKey}`, 3, 15 * 60 * 1000);
    if (!identityLimit.ok) {
      return NextResponse.json(rateLimitResponse(identityLimit.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(identityLimit.retryAfterSeconds) },
      });
    }

    // Return the same configuration error for every identity when SMTP is not
    // set up, so the endpoint cannot be used to enumerate accounts.
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: 'La récupération par email est temporairement indisponible. Contactez votre administrateur.' },
        { status: 503 }
      );
    }

    const user = await findPasswordRecoveryUser(identity);
    if (!user) {
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE }, { status: 200 });
    }

    const recipient = user.email?.trim();
    if (!recipient) return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE }, { status: 200 });

    try {
      await createAndSendOtp(user.id, recipient, user.school?.name || 'GradeUp');
    } catch (error) {
      if (error instanceof OtpDeliveryError) {
        const cause = error.deliveryCause as { code?: unknown; command?: unknown; responseCode?: unknown } | undefined;
        console.error('[ForgotPassword] Échec de livraison; compte et destinataire masqués.', {
          code: typeof cause?.code === 'string' ? cause.code : undefined,
          command: typeof cause?.command === 'string' ? cause.command : undefined,
          responseCode: typeof cause?.responseCode === 'number' ? cause.responseCode : undefined,
        });
        return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE }, { status: 200 });
      }
      throw error;
    }

    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE }, { status: 200 });
  } catch (error) {
    console.error('[ForgotPassword] Erreur:', error);
    return NextResponse.json(
      { error: 'Erreur interne lors de l’envoi.' },
      { status: 500 }
    );
  }
}
