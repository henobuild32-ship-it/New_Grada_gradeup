import { db } from '@/lib/db';
import { emitNotification } from './emitNotification';
import { CreateNotificationInput, NotificationPayload } from './notificationTypes';

/**
 * Creates a notification in the database and broadcasts it in real-time.
 */
export async function createNotification(input: CreateNotificationInput) {
  const {
    schoolId,
    userId,
    senderId = '',
    title = 'GradeUp',
    message,
    type = 'INFO',
    priority = 'NORMAL',
    metadata = {},
    targetRole = 'ALL',
    targetClassId = '',
  } = input;

  let metadataValue: Record<string, unknown> = {};
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadataValue = parsed;
    } catch { /* conserve une métadonnée non JSON sans la traiter comme une instruction */ }
  } else if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    metadataValue = metadata as Record<string, unknown>;
  }
  metadataValue.logo = '/logo-gradeup.png';
  const metadataString = JSON.stringify(metadataValue);

  // 1. Save to SQLite database
  const notification = await db.notification.create({
    data: {
      schoolId,
      userId: userId || null,
      senderId,
      title,
      message,
      type,
      priority,
      metadata: metadataString,
      targetRole,
      targetClassId,
      read: false,
    },
  });

  const payload: NotificationPayload = {
    id: notification.id,
    schoolId: notification.schoolId,
    userId: notification.userId,
    senderId: notification.senderId,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    priority: notification.priority,
    read: notification.read,
    metadata: notification.metadata,
    targetRole: notification.targetRole,
    targetClassId: notification.targetClassId,
    createdAt: notification.createdAt,
  };

  // 2. Emit the event in real-time
  emitNotification(payload);

  return notification;
}
