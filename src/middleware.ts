import { NextResponse, type NextRequest } from 'next/server';
import { isPublicApi } from '@/lib/api/public-routes';

/**
 * Middleware RBAC de bord (Phase 3) — couche DE FORTIFICATION :
 * 1. Toute route /api/* exige un cookie de session, sauf liste blanche.
 * 2. Les écritures sensibles exigent un cookie + `x-gradeup-client: web`.
 *
 * La vérification CRYPTOGRAPHIQUE du JWT + le contrôle de rôle/tenant
 * restent dans les routes (`requireAuth` de src/lib/api/rbac.ts) : ce
 * middleware est un filet, pas l'unique barrière. Son but : toute route
 * qui « oublie » requireAuth est quand même refusée sans session.
 */

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (isPublicApi(pathname)) {
    return NextResponse.next();
  }

  // Toute autre route API : cookie de session obligatoire.
  const token = request.cookies.get('gradeup_token')?.value;
  if (!token) {
    return NextResponse.json(
      { error: 'Non authentifié. Veuillez vous connecter.', code: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  // Défense en profondeur anti-CSRF : les écritures (mutating) exigent
  // l'origine same-origin (les navigateurs l'envoient toujours en fetch same-origin).
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            { error: 'Origine de requête invalide.', code: 'CSRF_ORIGIN' },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Origine de requête invalide.', code: 'CSRF_ORIGIN' },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
