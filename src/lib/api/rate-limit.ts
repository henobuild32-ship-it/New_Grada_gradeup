/**
 * Rate limiting en mémoire (par IP + clé optionnelle).
 * Fenêtre glissante simplifiée : compte par intervalle fixe.
 * Suffisant pour un déploiement unique ; passer sur Redis/Upstash en multi-instances.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Nettoyage périodique (ne bloque pas le event loop).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
if (typeof setInterval === 'function') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS).unref?.();
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * @param key     identifiant du sujet (ex: `login:1.2.3.4`, `push:userId`)
 * @param limit   nombre max d'occurrences
 * @param windowMs durée de la fenêtre en ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

/** IP d'une requête (x-forwarded-for prioritaire). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? 'unknown');
}

/** Rate limit classique par IP : 5 tentatives / 15 min (login, OTP…). */
export const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

/** Rate limit general API (anti-abus) : 120 req / min / IP. */
export const API_RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 } as const;

/** Rate limit écritures sensibles (push sync, paiements) : 30 / min / user. */
export const WRITE_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 } as const;

/** Réponse 429 uniforme. */
export function rateLimitResponse(retryAfterSeconds: number): { error: string; code: string; retryAfter: number } {
  return {
    error: `Trop de requêtes. Réessayez dans ${retryAfterSeconds}s.`,
    code: 'RATE_LIMITED',
    retryAfter: retryAfterSeconds,
  };
}
