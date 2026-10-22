import { NextResponse } from 'next/server';

/**
 * Erreurs API structurées. `handleApiError` convertit toute exception en
 * réponse JSON uniforme : `{ error: string, code?: string }` + statut HTTP.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? statusToCode(status);
  }
}

function statusToCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHENTICATED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_MEDIA_TYPE';
    case 422: return 'UNPROCESSABLE';
    case 423: return 'LOCKED';
    case 429: return 'RATE_LIMITED';
    default: return 'INTERNAL_ERROR';
  }
}

/** Lève 404 si `value` est null/undefined — message uniforme FR. */
export function assertFound<T>(value: T | null | undefined, message = 'Ressource introuvable.'): T {
  if (value === null || value === undefined) throw new ApiError(message, 404);
  return value;
}

/** Convertit toute erreur en réponse JSON. Ne fuit jamais un stacktrace. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'ValidationError') {
    return NextResponse.json(
      { error: (error as Error).message, code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }
  // AuthError legacy (src/lib/auth/authenticate.ts) — même shape.
  if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AuthError') {
    const status = (error as { status?: number }).status ?? 401;
    return NextResponse.json({ error: (error as Error).message, code: statusToCode(status) }, { status });
  }
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string' && (error as { code: string }).code.startsWith('P20')) {
    // Prisma : P2025 = record not found, P2002 = unique violation.
    const prismaCode = (error as { code: string }).code;
    const status = prismaCode === 'P2025' ? 404 : prismaCode === 'P2002' ? 409 : 400;
    return NextResponse.json(
      { error: status === 409 ? 'Cette valeur existe déjà.' : 'Ressource introuvable.', code: prismaCode },
      { status }
    );
  }
  const message = error instanceof Error ? error.message : 'Erreur serveur.';
  // En production, on masque les détails internes.
  const isProd = process.env.NODE_ENV === 'production';
  return NextResponse.json(
    { error: isProd ? 'Erreur serveur.' : message, code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}
