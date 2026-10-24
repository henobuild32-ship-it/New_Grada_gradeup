// Public routes are limited to authentication, payment callbacks with their
// own signature checks, and read-only validation needed before registration.
const PUBLIC_API_EXACT = new Set([
  '/api',
  '/api/health',
  '/api/reviews',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot',
  '/api/auth/verify-otp',
  '/api/auth/reset',
  '/api/auth/me',
  '/api/join/verify-school-code',
  '/api/parent-link/validate',
]);

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/payments/pawapay',
  '/api/payments/geniuspay',
];

export function isPublicApi(pathname: string): boolean {
  if (PUBLIC_API_EXACT.has(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}
