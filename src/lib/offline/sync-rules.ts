const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/** Backoff exponentiel borné, indépendant des services navigateur/IndexedDB. */
export function computeBackoffMs(attempts: number): number {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, safeAttempts - 1), MAX_BACKOFF_MS);
}

/** Les opérations sensibles ne doivent jamais être mises en file hors ligne. */
export function canQueueOffline(onlineOnly: boolean): boolean {
  return !onlineOnly;
}
