import { db } from '@/lib/db';

/**
 * Préférences de notification par utilisateur (Phase 3).
 * Contrôle les canaux in-app / push / email / SMS + types en sourdine.
 */
export interface NotificationPrefs {
  inApp: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  mutedTypes: string[];
}

export const DEFAULT_PREFS: NotificationPrefs = {
  inApp: true,
  push: true,
  email: false,
  sms: false,
  mutedTypes: [],
};

/** Charge les préférences (défaut si table absente ou ligne inexistante). */
export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const pref = await db.notificationPreference.findUnique({ where: { userId } });
    if (!pref) return DEFAULT_PREFS;
    let muted: string[] = [];
    try {
      muted = JSON.parse(pref.mutedTypes || '[]');
    } catch {
      muted = [];
    }
    return {
      inApp: pref.inApp,
      push: pref.push,
      email: pref.email,
      sms: pref.sms,
      mutedTypes: Array.isArray(muted) ? muted : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Doit-on créer la notification in-app pour ce type ? */
export async function shouldNotify(userId: string, type: string): Promise<{ inApp: boolean; push: boolean }> {
  const prefs = await getNotificationPrefs(userId);
  const muted = prefs.mutedTypes.includes(type) || prefs.mutedTypes.includes('*');
  return { inApp: prefs.inApp && !muted, push: prefs.push && !muted };
}
