import { db } from '@/lib/db';
import { createNotification } from './createNotification';
import { CreateNotificationInput } from './notificationTypes';
import { sendPushNotification } from './pushSender';
import { shouldNotify } from './preferences';
import { enqueueNotificationSend } from './retry-queue';

/**
 * Notification Engine (Cœur du Système GradeUp)
 * Centralise la création de notifications dans PostgreSQL (Supabase Realtime)
 * et coordonne l'envoi automatique de notifications push Web (PWA) d'arrière-plan.
 *
 * Phase 3 : respecte les préférences utilisateur (inApp/push/email/sms,
 * types en sourdine) et route les envois push par une file de retry
 * (backoff exponentiel, jamais de push perdu silencieusement).
 */
export async function notifyUser(input: CreateNotificationInput) {
  try {
    // 0. Préférences utilisateur (uniquement si notification ciblée).
    let allowInApp = true;
    let allowPush = true;
    if (input.userId) {
      const prefs = await shouldNotify(input.userId, input.type || 'INFO');
      allowInApp = prefs.inApp;
      allowPush = prefs.push;
      // Type en sourdine : on n'écrit même pas la notif in-app.
      if (!allowInApp && !allowPush) return null;
    }

    // 1. Persist notification in DB (automatically triggers Supabase Realtime Insert)
    const notification = allowInApp ? await createNotification(input) : null;
    if (!notification) {
      // Push seul : on crée quand même la ligne pour la tracabilité, marquée lue ?
      // Non : on s'arrête — le user a tout coupé pour ce type.
      return null;
    }

    // 2. Dispatch PWA Web Push notification in the background (via file de retry)
    const pushPayload = {
      title: notification.title,
      body: notification.message,
      url: getRouteForNotificationType(notification.type),
    };

    let targetUserIds: string[] = [];

    if (notification.userId) {
      // Direct notification: send to this user only
      targetUserIds = [notification.userId];
      if (allowPush) {
        enqueueNotificationSend(`direct:${notification.userId}:${notification.type}`, async () => {
          await sendPushNotification(notification.userId as string, pushPayload);
        });
      }
    } else {
      // Broadcast/Group notification: retrieve matching user IDs in school/class
      const whereClause: any = {
        schoolId: notification.schoolId,
        active: true,
      };

      // 'CLASS' n'est pas un rôle utilisateur → on ne filtre que pour les vrais rôles
      if (notification.targetRole && notification.targetRole !== 'ALL' && notification.targetRole !== 'CLASS') {
        whereClause.role = notification.targetRole;
      }

      if (notification.targetClassId) {
        whereClause.classEnrollments = {
          some: { classId: notification.targetClassId },
        };
      }

      const targetedUsers = await db.user.findMany({
        where: whereClause,
        select: { id: true },
      });
      targetUserIds = targetedUsers.map((u) => u.id);

      // PWA: envois Web Push via file de retry (1 job par destinataire)
      for (const id of targetUserIds) {
        enqueueNotificationSend(`broadcast:${id}:${notification.type}`, async () => {
          await sendPushNotification(id, pushPayload);
        });
      }
    }

    return notification;
  } catch (error) {
    console.error('[NotificationEngine] Erreur lors de la notification utilisateur:', error);
    throw error;
  }
}

/**
 * Resolves the relevant PWA redirection path depending on the event type
 */
function getRouteForNotificationType(type: string): string {
  switch (type) {
    case 'CONFERENCE':
      return '/meetings';
    case 'MESSAGE':
      return '/messages';
    case 'CARD':
      return '/admin-cards';
    case 'LESSON':
      return '/lessons';
    case 'DOCUMENT':
      return '/library';
    case 'HOMEWORK':
    case 'HOMEWORK_SUBMISSION':
      return '/homework';
    case 'GRADE':
      return '/grades';
    case 'ATTENDANCE':
      return '/attendance';
    case 'PAYMENT':
      return '/payments';
    case 'REPORT_CARD':
      return '/bulletins';
    case 'COTATION':
    case 'COTATION_RECEIVED':
      return '/?module=cahier-cotation';
    default:
      return '/';
  }
}
