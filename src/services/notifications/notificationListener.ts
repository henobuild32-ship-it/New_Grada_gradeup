import type { NotificationInfo } from '@/lib/types';

export interface RealtimeNotification extends NotificationInfo {
  title?: string;
  type?: string;
  priority?: string;
  metadata?: unknown;
}

export interface SubscribeParams {
  userId: string;
  role: string;
  schoolId: string;
  onNotification: (notification: RealtimeNotification) => void;
}

/**
 * Opens the session-scoped notification stream. The server verifies the JWT
 * and filters by role, user and class before any notification reaches the UI.
 */
export function subscribeToNotifications({
  userId,
  role,
  schoolId,
  onNotification,
}: SubscribeParams): () => void {
  if (typeof window === 'undefined') return () => {};

  const query = new URLSearchParams({ userId, role, schoolId });
  const eventSource = new EventSource(`/api/notifications/stream?${query.toString()}`);
  const seenIds = new Set<string>();
  let lastSeenAt = new Date().toISOString();

  const deliver = (notification: RealtimeNotification) => {
    if (!notification.id || seenIds.has(notification.id)) return;
    seenIds.add(notification.id);
    if (notification.createdAt && new Date(notification.createdAt).getTime() > new Date(lastSeenAt).getTime()) {
      lastSeenAt = new Date(notification.createdAt).toISOString();
    }
    onNotification(notification);
    window.dispatchEvent(new CustomEvent('gradeup-notification', { detail: notification }));
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as RealtimeNotification | { heartbeat?: boolean };
      if ('heartbeat' in data && data.heartbeat) return;
      if (!('id' in data) || !data.id) return;

      deliver(data);
    } catch (error) {
      console.error('[NotificationListener] Error parsing SSE payload:', error);
    }
  };

  eventSource.onerror = () => {
    // EventSource reconnects automatically while this component remains mounted.
    console.warn('[NotificationListener] Session notification stream disconnected; reconnecting.');
  };

  // Server-sent events are immediate on a single server process. Polling the
  // persisted inbox also catches inserts made by another Vercel function
  // instance, and covers browsers that have temporarily lost the SSE stream.
  let polling = false;
  const poll = async () => {
    if (polling || document.visibilityState === 'hidden') return;
    polling = true;
    try {
      const params = new URLSearchParams({ since: lastSeenAt });
      const response = await fetch(`/api/notifications?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { notifications?: RealtimeNotification[] } | RealtimeNotification[];
      const notifications = Array.isArray(payload) ? payload : payload.notifications ?? [];
      notifications
        .filter((notification) => Boolean(notification.id))
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
        .forEach(deliver);
    } catch {
      // The stream reconnects automatically; the next poll retries the inbox.
    } finally {
      polling = false;
    }
  };
  const pollInterval = window.setInterval(poll, 15_000);
  window.addEventListener('online', poll);

  return () => {
    eventSource.close();
    window.clearInterval(pollInterval);
    window.removeEventListener('online', poll);
  };
}
