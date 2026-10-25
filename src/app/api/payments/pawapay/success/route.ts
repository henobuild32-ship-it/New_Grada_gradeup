import { NextRequest, NextResponse } from 'next/server';

/**
 * A browser redirect alone is not proof that a provider captured a payment.
 * Do not mutate students or issue cards from this unauthenticated callback.
 * A verified provider webhook is required before the cashier records payment.
 */
export async function GET(request: NextRequest) {
  const target = new URL('/', request.url);
  target.searchParams.set('page', 'admin-cards');
  target.searchParams.set('payment', 'verification-required');
  return NextResponse.redirect(target, 303);
}
