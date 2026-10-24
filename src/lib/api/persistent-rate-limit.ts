import { createHash, randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/api/rate-limit';

export interface PersistentRateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Fixed-window, atomic rate limiting shared by all application instances. */
export async function persistentRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<PersistentRateLimitResult> {
  const now = new Date();
  const nextResetAt = new Date(now.getTime() + windowMs);
  const hashedKey = createHash('sha256').update(key).digest('hex');
  let rows: Array<{ count: number; resetAt: Date }>;
  try {
    rows = await db.$queryRaw<Array<{ count: number; resetAt: Date }>>(Prisma.sql`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "createdAt", "updatedAt")
      VALUES (${hashedKey}, 1, ${nextResetAt}, ${now}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${nextResetAt}
          ELSE "RateLimitBucket"."resetAt"
        END,
        "updatedAt" = ${now}
      RETURNING "count", "resetAt"
    `);
  } catch {
    // Older deployments may not have the new table yet. Keep the verification
    // flows available and retain an in-process limit until the migration lands.
    return rateLimit(key, limit, windowMs);
  }

  // Opportunistically prune expired buckets without adding a scheduled job.
  if (randomInt(100) === 0) {
    void db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }).catch(() => undefined);
  }

  const bucket = rows[0];
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000));
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds,
  };
}
