import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

function classifyDatabaseTarget(databaseUrl) {
  if (!databaseUrl) return 'missing';
  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    if (hostname.endsWith('.supabase.co') || hostname.endsWith('.pooler.supabase.com')) return 'supabase';
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'local';
    if (hostname.endsWith('.neon.tech')) return 'neon';
    return 'other';
  } catch {
    return 'invalid';
  }
}

function readDatabaseTarget(path) {
  try {
    const contents = readFileSync(path, 'utf8');
    const match = contents.match(/^\s*DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m);
    return classifyDatabaseTarget(match?.[1]?.trim());
  } catch {
    return 'missing';
  }
}

const pulledEnv = process.argv[2]
  ? dotenv.parse(readFileSync(process.argv[2], 'utf8'))
  : null;

console.log(JSON.stringify({
  runtimeDatabaseTarget: classifyDatabaseTarget(process.env.DATABASE_URL),
  localEnvTarget: readDatabaseTarget('.env'),
  localEnvLocalTarget: readDatabaseTarget('.env.local'),
  pulledEnvTarget: pulledEnv ? classifyDatabaseTarget(pulledEnv.DATABASE_URL) : 'not-checked',
  pulledEnvMatchesLocalHost: pulledEnv?.DATABASE_URL
    ? new URL(pulledEnv.DATABASE_URL).hostname === new URL(readFileSync('.env', 'utf8').match(/^\s*DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim() ?? 'http://invalid').hostname
    : false,
  pulledSmtpConfigured: Boolean(pulledEnv?.SMTP_HOST && pulledEnv?.SMTP_PORT && pulledEnv?.SMTP_FROM),
  smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM),
  jwtConfigured: Boolean(process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET),
}));
