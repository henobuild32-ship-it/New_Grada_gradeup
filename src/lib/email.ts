import nodemailer from 'nodemailer';

/**
 * Email helper (Nodemailer + SMTP)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends transactional emails (OTP, réinitialisation de mot de passe…).
 * Variables d'environnement attendues :
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

const host = process.env.SMTP_HOST || '';
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';

const fromName = 'GradeUp';
const fromAddress = process.env.SMTP_FROM || user;

export function emailConfigurationStatus() {
  const hasHost = Boolean(host.trim());
  const hasSender = /[^\s<>]+@[^\s<>]+\.[^\s<>]+/.test(fromAddress);
  const hasUser = Boolean(user);
  const hasPass = Boolean(pass);
  const authPairIsValid = hasUser === hasPass;
  const validPort = Number.isInteger(port) && port > 0 && port <= 65535;
  return {
    configured: hasHost && hasSender && authPairIsValid && validPort,
    hasHost,
    hasSender,
    authPairIsValid,
    validPort,
    port,
    secure: process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE !== 'false' && port === 465),
  };
}

export function isEmailConfigured(): boolean {
  return emailConfigurationStatus().configured; // SMTP peut être open-relay (sans identifiants)
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: emailConfigurationStatus().secure,
      auth:
        user
          ? { user, pass }
          : undefined,
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false',
      },
    });
  }
  return transporter;
}

export interface MailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Envoie un email transactionnel.
 * Retourne `true` si l'email a été envoyé, `false` si le SMTP n'est pas configuré.
 * Lance une erreur si l'envoi échoue (pour logging côté appelant).
 */
export async function sendEmail(payload: MailPayload): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn('[Email] SMTP non configuré — envoi ignoré:', payload.subject);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: fromAddress.includes('<') ? fromAddress : `"${fromName}" <${fromAddress}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return true;
  } catch (error) {
    const mailError = error as { code?: unknown; command?: unknown; responseCode?: unknown };
    console.error('[Email] Échec d’envoi SMTP.', {
      code: typeof mailError?.code === 'string' ? mailError.code : undefined,
      command: typeof mailError?.command === 'string' ? mailError.command : undefined,
      responseCode: typeof mailError?.responseCode === 'number' ? mailError.responseCode : undefined,
    });
    throw error;
  }
}
