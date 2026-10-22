import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { isOnlineOnly } from '@/lib/sync/conflicts';
import { rateLimit, rateLimitResponse, WRITE_RATE_LIMIT } from '@/lib/api/rate-limit';

/**
 * POST /api/sync/push — batch de mutations hors ligne.
 *
 * Reçoit un tableau de mutations (outbox client) et les relaie vers les
 * routes métier existantes (validation préservée). Idempotence : même
 * clientMutationId = même résultat (registre SyncOperation). Les opérations
 * sensibles (online-only) sont refusées avec un message clair.
 */

interface PushMutation {
  clientMutationId: string;
  entity: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload: Record<string, unknown>;
  schoolId: string;
  clientUpdatedAt: number;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
}

/**
 * Allowlist des endpoints rejouables. On relaie vers les routes métier
 * existantes pour conserver toute la validation (rôles, année, règles RDC).
 * `^/api/...` = chemin exact ; `[id]` = segment dynamique.
 */
const ALLOWED: Array<{ pattern: RegExp; methods: string[] }> = [
  { pattern: /^\/api\/attendance\/batch$/, methods: ['POST'] },
  { pattern: /^\/api\/grades$/, methods: ['POST'] },
  { pattern: /^\/api\/grades\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^\/api\/homework$/, methods: ['POST'] },
  { pattern: /^\/api\/homework\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^\/api\/submissions$/, methods: ['POST'] },
  { pattern: /^\/api\/submissions\/[^/]+$/, methods: ['PUT'] },
  { pattern: /^\/api\/messages$/, methods: ['POST'] },
  { pattern: /^\/api\/notifications\/[^/]+$/, methods: ['PUT'] },
  { pattern: /^\/api\/lessons$/, methods: ['POST'] },
  { pattern: /^\/api\/lessons\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^\/api\/schedules$/, methods: ['POST'] },
  { pattern: /^\/api\/schedules\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^\/api\/resources$/, methods: ['POST'] },
  { pattern: /^\/api\/resources\/[^/]+$/, methods: ['PUT', 'DELETE'] },
  { pattern: /^\/api\/events$/, methods: ['POST'] },
  { pattern: /^\/api\/events\/[^/]+$/, methods: ['PUT', 'DELETE'] },
];

function isAllowed(pathname: string, method: string): boolean {
  return ALLOWED.some((rule) => rule.pattern.test(pathname) && rule.methods.includes(method));
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    const rl = rateLimit(`sync-push:${auth.userId}`, WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
    if (!rl.ok) {
      return NextResponse.json(rateLimitResponse(rl.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      });
    }
    const body = (await request.json()) as { mutations?: PushMutation[] };
    const mutations = Array.isArray(body.mutations) ? body.mutations : [];
    if (mutations.length === 0) {
      return NextResponse.json({ error: 'Aucune mutation fournie' }, { status: 400 });
    }
    if (mutations.length > 50) {
      return NextResponse.json({ error: 'Batch trop volumineux (max 50)' }, { status: 400 });
    }

    const results: Array<{ clientMutationId: string; ok: boolean; status: number; id?: string; error?: string }> = [];

    for (const mutation of mutations) {
      const { clientMutationId, entity, operation, endpoint, method } = mutation;

      // 1) Idempotence : si déjà traité, renvoyer le résultat enregistré.
      const previous = await db.syncOperation.findUnique({ where: { operationId: clientMutationId } });
      if (previous) {
        if (previous.userId !== auth.userId || previous.schoolId !== auth.schoolId) {
          results.push({ clientMutationId, ok: false, status: 403, error: 'Clé de synchronisation invalide' });
          continue;
        }
        results.push({
          clientMutationId,
          ok: previous.statusCode < 400,
          status: previous.statusCode,
          id: (previous.response as { id?: string })?.id,
          error: (previous.response as { error?: string })?.error,
        });
        continue;
      }

      // 2) Opération sensible (online-only) → refus clair.
      if (isOnlineOnly(entity, operation)) {
        results.push({
          clientMutationId,
          ok: false,
          status: 403,
          error: 'Connexion requise : cette opération ne peut pas être effectuée hors ligne.',
        });
        continue;
      }

      // 3) Allowlist endpoint + méthode.
      let pathname: string;
      try {
        pathname = new URL(endpoint, request.url).pathname;
      } catch {
        results.push({ clientMutationId, ok: false, status: 400, error: 'Endpoint invalide' });
        continue;
      }
      if (!isAllowed(pathname, method)) {
        results.push({ clientMutationId, ok: false, status: 400, error: `Opération offline non autorisée (${method} ${pathname})` });
        continue;
      }

      // 4) Relais vers la route métier (cookie + idempotency key).
      try {
        const headers = new Headers();
        headers.set('cookie', request.headers.get('cookie') || '');
        headers.set('content-type', 'application/json');
        headers.set('x-idempotency-key', clientMutationId);

        const target = new URL(endpoint, request.url);
        const response = await fetch(target, {
          method,
          headers,
          body: method === 'DELETE' ? undefined : JSON.stringify(mutation.payload ?? {}),
          cache: 'no-store',
        });
        const text = await response.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }

        // 5) Enregistrer dans le registre d'idempotence.
        await db.syncOperation.create({
          data: {
            operationId: clientMutationId,
            userId: auth.userId,
            schoolId: auth.schoolId,
            operationType: `${entity}:${operation}`,
            statusCode: response.status,
            response: (parsed ?? {}) as object,
          },
        });

        results.push({
          clientMutationId,
          ok: response.ok,
          status: response.status,
          id: (parsed as { id?: string })?.id,
          error: response.ok ? undefined : ((parsed as { error?: string })?.error || `HTTP ${response.status}`),
        });
      } catch (relayError) {
        results.push({
          clientMutationId,
          ok: false,
          status: 502,
          error: relayError instanceof Error ? relayError.message : 'Erreur de relais',
        });
      }
    }

    const anyOk = results.some((r) => r.ok);
    return NextResponse.json({ results }, { status: anyOk ? 200 : 207 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erreur de synchronisation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
