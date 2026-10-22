import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/services/notifications/createNotification';
import { sendOneSignalToUserIds } from '@/services/onesignal/sender';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';
import webpush from 'web-push';
import { APP_VERSION, APP_VERSION_LABEL } from '@/lib/app-version';

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(
      'mailto:gradeupgradeup6@gmail.com',
      publicKey,
      privateKey
    );
  } catch (e) {
    console.error('[BroadcastUpdate] Webpush VAPID init error:', e);
  }
}

// Route pour envoyer la notification de mise à jour GradeUp (ADMIN uniquement,
// et strictement limitée à l'école de l'admin connecté).
export async function POST(request: NextRequest) {
  try {
    // Sécurité : seul un administrateur peut déclencher une diffusion
    const auth = await requireAuth(request, ['ADMIN']);

    // Tenant forcé par la session : aucune écriture/notification hors école.
    const schoolId = auth.schoolId;
    const schools = await db.school.findMany({
      where: { id: schoolId },
      select: { id: true },
    });

    const schoolUserIds = (
      await db.user.findMany({ where: { schoolId }, select: { id: true } })
    ).map((u) => u.id);

    const title = `🚀 GradeUp ${APP_VERSION_LABEL} est disponible !`;
    const message = "Une nouvelle mise à jour est disponible. Profitez des dernières améliorations et corrections. Mettez à jour maintenant !";

    const createdNotifications: any[] = [];

    // 1. Créer les notifications dans la base pour l'école de l'admin connecté
    for (const school of schools) {
      const notif = await createNotification({
        schoolId: school.id,
        senderId: 'SYSTEM',
        targetRole: 'ALL',
        targetClassId: '',
        title,
        message,
        type: 'SYSTEM',
        priority: 'URGENT',
        metadata: {
          updateVersion: APP_VERSION,
          updateVersionLabel: APP_VERSION_LABEL,
          feature: 'Global Update',
        },
      });
      createdNotifications.push(notif);
    }

    // 2. Envoyer un Web Push aux appareils abonnés des comptes de cette école
    let pushSentCount = 0;
    if (publicKey && privateKey) {
      const subscriptions = await db.pushSubscription.findMany({
        where: { userId: { in: schoolUserIds } },
      });
      
      const pushPayload = JSON.stringify({
        title,
        body: message,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'gradeup-update',
        requireInteraction: true,
        data: { url: '/', type: 'APP_UPDATE', version: APP_VERSION },
      });

      const pushPromises = subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            pushPayload
          );
          pushSentCount++;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          }
        }
      });

      await Promise.all(pushPromises);
    }

    // 3. Push OneSignal ciblé sur les comptes de l'école (external_id = user id)
    await sendOneSignalToUserIds(schoolUserIds, {
      title,
      message,
      url: '/',
      data: { updateVersion: APP_VERSION, type: 'APP_UPDATE' },
    });

    return NextResponse.json({
      success: true,
      message: `Notification de mise à jour ${APP_VERSION_LABEL} diffusée avec succès.`,
      notificationsCreated: createdNotifications.length,
      pushSentCount,
    });
  } catch (error) {
    console.error('[BROADCAST NOTIFICATION ERROR]', error);
    return handleApiError(error);
  }
}

// GET est un raccourci (mêmes droits qu'un POST) — l'authentification est exigée
export async function GET(request: NextRequest) {
  // Sécurité: lecture seule, n'autorise pas le déclenchement non authentifié
  return NextResponse.json(
    { error: 'Méthode non autorisée. Utilisez POST (ADMIN requis).' },
    { status: 405 }
  );
}
