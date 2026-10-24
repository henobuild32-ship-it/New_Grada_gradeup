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

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as RealtimeNotification | { heartbeat?: boolean };
      if ('heartbeat' in data && data.heartbeat) return;
      if (!('id' in data) || !data.id) return;

      onNotification(data);
      window.dispatchEvent(new CustomEvent('gradeup-notification', { detail: data }));
    } catch (error) {
      console.error('[NotificationListener] Error parsing SSE payload:', error);
    }
  };

  eventSource.onerror = () => {
    // EventSource reconnects automatically while this component remains mounted.
    console.warn('[NotificationListener] Session notification stream disconnected; reconnecting.');
  };

  return () => eventSource.close();
}
