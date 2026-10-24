import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { generateOtpCode, generateOtpSalt, hashOtpCode, OTP_LENGTH, verifyOtpHash } from '@/lib/auth/otp-code';

/**
 * Password reset OTP (mot de passe oublié) — tous types d'utilisateurs.
 * ─────────────────────────────────────────────────────────────────────────────
 * - OTP 6 chiffres, stocké HASHÉ (sha256 + sel) avec TTL (10 min)
 * - Envoi par email (Nodemailer/SMTP)
 * - Un seul OTP actif par utilisateur ; 5 essais max avant invalidation
 */

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export { OTP_LENGTH };
const MAX_ATTEMPTS = 5;

export class OtpDeliveryError extends Error {
  constructor(message = 'Le service email ne peut pas envoyer de message actuellement.') {
    super(message);
    this.name = 'OtpDeliveryError';
  }
}

async function getActivePasswordReset(userId: string) {
  return db.passwordReset.findFirst({
    where: { userId, used: false, otpExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Crée (ou remplace) un OTP pour l'utilisateur et envoie l'email.
 * Retourne l'OTP généré (uniquement utile en dev/logging).
 */
export async function createAndSendOtp(
  userId: string,
  email: string,
  schoolName = 'GradeUp'
): Promise<string> {
  const otp = generateOtpCode();
  const salt = generateOtpSalt();
  const otpHash = hashOtpCode(otp, salt);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

  // The partial unique index in the migration guarantees one outstanding OTP
  // per account even when two requests arrive at the same time.
  let recordId = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await db.$transaction(async (tx) => {
        await tx.passwordReset.updateMany({
          where: { userId, used: false },
          data: { used: true },
        });

        return tx.passwordReset.create({
          data: { userId, email, otpHash, otpSalt: salt, otpExpiresAt },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      recordId = record.id;
      break;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if ((code !== 'P2002' && code !== 'P2034') || attempt === 2) throw error;
    }
  }

  if (!recordId) throw new Error('Impossible de créer le code de réinitialisation.');

  const safeSchoolName = schoolName.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(90deg,#2563eb,#6d28d9);padding:16px 24px;color:#fff">
        <h2 style="margin:0;font-size:18px">🔐 ${safeSchoolName} — Réinitialisation du mot de passe</h2>
      </div>
      <div style="padding:24px">
        <p style="color:#334155;font-size:14px;line-height:1.6">Bonjour,</p>
        <p style="color:#334155;font-size:14px;line-height:1.6">
          Vous avez demandé la réinitialisation de votre mot de passe.
          Utilisez le code ci-dessous pour continuer :
        </p>
        <div style="text-align:center;margin:24px 0">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1e3a8a;background:#eff6ff;padding:12px 20px;border-radius:10px;display:inline-block">${otp}</span>
        </div>
        <p style="color:#64748b;font-size:13px;line-height:1.6">
          Ce code est valable <strong>10 minutes</strong>. Si vous n'êtes pas à l'origine de cette demande,
          vous pouvez ignorer cet email — votre mot de passe reste inchangé.
        </p>
      </div>
    </div>
  `;

  try {
    const sent = await sendEmail({
      to: email,
      subject: `Code de réinitialisation — ${schoolName}`,
      text: `Votre code de réinitialisation est : ${otp}. Valable 10 minutes.`,
      html,
    });
    if (!sent) throw new OtpDeliveryError();
  } catch (error) {
    // A code that was not delivered must never remain usable as an unknown
    // background credential.
    await db.passwordReset.updateMany({
      where: { id: recordId, used: false },
      data: { used: true },
    });
    throw error instanceof OtpDeliveryError ? error : new OtpDeliveryError();
  }

  return otp;
}

/** Verify the code, consume it, change the password and revoke prior sessions atomically. */
export async function resetPasswordWithOtp(userId: string, code: string, passwordHash: string) {
  if (!/^\d{6}$/.test(code)) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const now = new Date();
        const record = await tx.passwordReset.findFirst({
          where: { userId, used: false, otpExpiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
        });
        if (!record || record.wrongAttempts >= MAX_ATTEMPTS) return null;

        if (!verifyOtpHash(code, record.otpSalt, record.otpHash)) {
          const nextAttempts = record.wrongAttempts + 1;
          await tx.passwordReset.updateMany({
            where: { id: record.id, used: false, wrongAttempts: record.wrongAttempts },
            data: {
              wrongAttempts: { increment: 1 },
              ...(nextAttempts >= MAX_ATTEMPTS ? { used: true } : {}),
            },
          });
          return null;
        }

        const consumed = await tx.passwordReset.updateMany({
          where: {
            id: record.id,
            userId,
            used: false,
            wrongAttempts: record.wrongAttempts,
            otpExpiresAt: { gt: now },
          },
          data: { used: true },
        });
        if (consumed.count !== 1) return null;

        return tx.user.update({
          where: { id: userId },
          data: { password: passwordHash, authVersion: { increment: 1 } },
          include: {
            school: true,
            classEnrollments: { include: { class: true } },
            children: true,
            titulaireClasses: true,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'P2034' || attempt === 2) throw error;
    }
  }
  return null;
}

/**
 * Vérifie le code OTP sans le consommer.
 * Utilisé pour l'étape intermédiaire "vérifier le code" avant l'étape reset.
 */
export async function checkOtpCode(userId: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  // Compare-and-increment prevents simultaneous guesses from overwriting one
  // another and bypassing the attempt counter.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const record = await getActivePasswordReset(userId);
    if (!record || record.wrongAttempts >= MAX_ATTEMPTS) return false;

    if (verifyOtpHash(code, record.otpSalt, record.otpHash)) return true;

    const nextAttempts = record.wrongAttempts + 1;
    const changed = await db.passwordReset.updateMany({
      where: { id: record.id, used: false, wrongAttempts: record.wrongAttempts },
      data: {
        wrongAttempts: { increment: 1 },
        ...(nextAttempts >= MAX_ATTEMPTS ? { used: true } : {}),
      },
    });
    if (changed.count === 1) return false;
  }
  return false;
}
