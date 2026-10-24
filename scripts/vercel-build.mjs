import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function run(command, args, label, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(`${label} could not start.`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL_ENV === 'production') {
  if (!process.env.DATABASE_URL) {
    console.error('Production database configuration is missing.');
    process.exit(1);
  }

  run(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    'Production database migration',
    // The configured direct Supabase endpoint is IPv6-only and unreachable from
    // Vercel's build network. DATABASE_URL uses Supavisor session mode (5432),
    // which keeps a stable session and supports Prisma migrations.
    { ...process.env, DIRECT_URL: process.env.DATABASE_URL },
  );
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('npm executable path is unavailable for the Vercel build.');
  process.exit(1);
}

run(process.execPath, [npmCli, 'run', 'build'], 'Application build');
