import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST?.trim() || '';
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER?.trim() || '';
const pass = process.env.SMTP_PASS || '';
const sender = process.env.SMTP_FROM?.trim() || user;
const secure = process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE !== 'false' && port === 465);
const validSender = /[^\s<>]+@[^\s<>]+\.[^\s<>]+/.test(sender);
const validAuth = Boolean(user) === Boolean(pass);

if (!host || !validSender || !validAuth || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('SMTP_CONFIG_INCOMPLETE', JSON.stringify({
    hasHost: Boolean(host),
    hasValidSender: validSender,
    validAuthPair: validAuth,
    validPort: Number.isInteger(port) && port > 0 && port <= 65535,
  }));
  process.exitCode = 1;
} else {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false' },
  });
  try {
    await transporter.verify();
    console.log(`SMTP_VERIFY_OK port=${port} secure=${secure}`);
  } catch (error) {
    const details = error && typeof error === 'object' ? error : {};
    console.error('SMTP_VERIFY_FAILED', JSON.stringify({
      code: typeof details.code === 'string' ? details.code : undefined,
      command: typeof details.command === 'string' ? details.command : undefined,
      responseCode: typeof details.responseCode === 'number' ? details.responseCode : undefined,
    }));
    process.exitCode = 1;
  } finally {
    transporter.close();
  }
}
