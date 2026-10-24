/** Refreshes an expired access cookie once, then retries the original request. */
export function installAuthenticatedFetchRecovery() {
  if (typeof window === 'undefined') return () => {};

  const target = window as Window & { __gradeUpFetchRecovery?: () => void };
  if (target.__gradeUpFetchRecovery) return target.__gradeUpFetchRecovery;

  const nativeFetch = window.fetch.bind(window);
  let refreshInFlight: Promise<boolean> | null = null;
  const publicAuthPaths = new Set([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/forgot',
    '/api/auth/verify-otp',
    '/api/auth/reset',
  ]);

  const refreshSession = () => {
    if (!refreshInFlight) {
      refreshInFlight = nativeFetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      })
        .then((response) => {
          if (response.status === 401) {
            window.dispatchEvent(new Event('gradeup-session-expired'));
          }
          return response.ok;
        })
        .catch(() => false)
        .finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  };

  const wrappedFetch: typeof window.fetch = async (input, init) => {
    let request: Request;
    try {
      request = new Request(input, init);
    } catch {
      return nativeFetch(input, init);
    }

    const url = new URL(request.url, window.location.origin);
    if (url.origin !== window.location.origin || publicAuthPaths.has(url.pathname)) {
      return nativeFetch(request);
    }

    const retryRequest = request.clone();
    const response = await nativeFetch(request);
    if (response.status !== 401 || !url.pathname.startsWith('/api/')) return response;

    if (!(await refreshSession())) return response;
    return nativeFetch(retryRequest);
  };

  window.fetch = wrappedFetch;
  const cleanup = () => {
    if (window.fetch === wrappedFetch) window.fetch = nativeFetch;
    if (target.__gradeUpFetchRecovery === cleanup) delete target.__gradeUpFetchRecovery;
  };
  target.__gradeUpFetchRecovery = cleanup;
  return cleanup;
}
