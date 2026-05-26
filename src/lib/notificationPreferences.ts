export type NotificationMode = 'all' | 'mentions';

export interface NotificationPreferences {
  mode: NotificationMode;
  mutedChannelIds: string[];
  desktopSound: boolean;
  quietHoursEnabled: boolean;
  quietStart: string; // HH:mm
  quietEnd: string; // HH:mm
}

export const NOTIFICATION_PREFS_KEY = 'asiteam_notification_prefs';
export const NOTIFICATION_PREFS_EVENT = 'notificationPrefsUpdated';

const DEFAULT_PREFS: NotificationPreferences = {
  mode: 'all',
  mutedChannelIds: [],
  desktopSound: true,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
};

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      mutedChannelIds: Array.isArray(parsed.mutedChannelIds) ? parsed.mutedChannelIds : [],
      mode: parsed.mode === 'mentions' ? 'mentions' : 'all',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveNotificationPreferences(next: NotificationPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(NOTIFICATION_PREFS_EVENT, { detail: next }));
}

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(v => Number(v || 0));
  return (h * 60) + m;
}

export function isQuietHoursNow(prefs: NotificationPreferences, now = new Date()): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const start = toMinutes(prefs.quietStart);
  const end = toMinutes(prefs.quietEnd);
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function shouldNotifyForMessage(params: {
  prefs: NotificationPreferences;
  channelId: string;
  messageText: string | null | undefined;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
}) {
  const { prefs, channelId, messageText, currentUserName, currentUserEmail } = params;
  if (prefs.mutedChannelIds.includes(channelId)) return false;
  if (isQuietHoursNow(prefs)) return false;
  if (prefs.mode === 'all') return true;
  const text = (messageText || '').toLowerCase();
  if (!text) return false;
  const nameToken = (currentUserName || '').trim().toLowerCase().replace(/\s+/g, '');
  const emailToken = (currentUserEmail || '').split('@')[0]?.trim().toLowerCase() || '';
  if (nameToken && text.includes(`@${nameToken}`)) return true;
  if (emailToken && text.includes(`@${emailToken}`)) return true;
  return false;
}
