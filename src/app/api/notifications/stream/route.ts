import { NextRequest } from 'next/server';
import { notificationEmitter } from '@/services/notifications/notificationEmitter';
import { authenticateRequestActive, AuthError, type AuthUser } from '@/lib/auth/authenticate';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const role = searchParams.get('role');
  const schoolId = searchParams.get('schoolId');

  if (!schoolId) {
    return new Response('schoolId is required', { status: 400 });
  }

  let auth: AuthUser;
  try {
    auth = await authenticateRequestActive(request);
  } catch (error) {
    if (error instanceof AuthError) return new Response(error.message, { status: error.status });
    return new Response('Session invalide', { status: 401 });
  }
  if (auth.userId !== userId || auth.schoolId !== schoolId || auth.role !== role) {
    return new Response('Session invalide', { status: 401 });
  }

  const classIds = new Set<string>();
  if (auth.role === 'STUDENT') {
    const enrollments = await db.enrolledClass.findMany({
      where: {
        userId: auth.userId,
        class: { schoolId: auth.schoolId, deletedAt: null },
      },
      select: { classId: true },
    });
    for (const item of enrollments) classIds.add(item.classId);
  } else if (auth.role === 'TEACHER') {
    const [courses, titulaireClasses] = await Promise.all([
      db.course.findMany({
        where: {
          schoolId: auth.schoolId,
          teacherId: auth.userId,
          deletedAt: null,
        },
        select: { classId: true },
        distinct: ['classId'],
      }),
      db.schoolClass.findMany({
        where: {
          schoolId: auth.schoolId,
          titulaireId: auth.userId,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    for (const item of courses) classIds.add(item.classId);
    for (const item of titulaireClasses) classIds.add(item.id);
  } else if (auth.role === 'PARENT') {
    const childrenEnrollments = await db.enrolledClass.findMany({
      where: {
        class: { schoolId: auth.schoolId, deletedAt: null },
        user: {
          schoolId: auth.schoolId,
          parentId: auth.userId,
          role: 'STUDENT',
          deletedAt: null,
        },
      },
      select: { classId: true },
    });
    for (const item of childrenEnrollments) classIds.add(item.classId);
  }

  const responseStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper function to write SSE events
      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          // controller might already be closed
        }
      };

      // Send initial connection payload (keepalive / handshake)
      sendEvent({ heartbeat: true, timestamp: new Date().toISOString() });

      // Live notification event handler
      const onNotification = (notification: {
        id?: string;
        schoolId?: string;
        userId?: string | null;
        targetRole?: string | null;
        targetClassId?: string | null;
      }) => {
        // Multi-tenant check
        if (notification.schoolId !== schoolId) return;

        // Recipient filtering rules:
        // 1. Direct recipient
        const isDirectRecipient = notification.userId && notification.userId === userId;

        // Administrators can review all notifications within their school.
        const isSchoolAdministrator = auth.role === 'ADMIN';

        // 2. Broadcast role target (e.g. STUDENT, PARENT, TEACHER)
        const isRoleTarget = notification.targetRole && 
                             notification.targetRole !== 'ALL' && 
                             notification.targetRole === role;

        // 3. Broadcast class target (restricted to class memberships)
        const isClassTarget =
          notification.targetRole === 'CLASS' &&
          typeof notification.targetClassId === 'string' &&
          classIds.has(notification.targetClassId);

        // 4. School-wide broadcast
        const isGlobalBroadcast = (!notification.userId || notification.userId === '') && 
                                  (!notification.targetRole || notification.targetRole === 'ALL');

        if (isSchoolAdministrator || isDirectRecipient || isRoleTarget || isClassTarget || isGlobalBroadcast) {
          sendEvent(notification);
        }
      };

      // Register the event listener on the singleton emitter
      notificationEmitter.on('notification', onNotification);

      // Setup a heartbeat interval to keep connection alive (prevent Caddy / Cloudflare / Vercel timeouts)
      const heartbeatInterval = setInterval(() => {
        sendEvent({ heartbeat: true });
      }, 15000);

      // Clean up when the client aborts/closes the SSE stream
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        notificationEmitter.off('notification', onNotification);
        try {
          controller.close();
        } catch {
          // ignore already closed stream errors
        }
      });
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering on Nginx proxies for instant delivery
    },
  });
}
