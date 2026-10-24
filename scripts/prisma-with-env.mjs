import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const envFile = process.argv[2];
const prismaArgs = process.argv.slice(3);
if (!envFile || prismaArgs.length === 0) {
  console.error('Usage: node scripts/prisma-with-env.mjs <env-file> <prisma command...>');
  process.exit(2);
}

const fileEnv = dotenv.parse(readFileSync(resolve(envFile)));
const env = { ...process.env, ...fileEnv };
const prismaCli = resolve('node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, ...prismaArgs], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to start Prisma CLI.');
  process.exit(1);
}
process.exit(result.status ?? 1);
