export const NOTIFICATION_PREFERENCE_TYPES = [
  "dm",
  "global_chat",
  "streak_end",
  "result_comment",
  "admin_broadcast",
  "trophy_unlock",
  "support_reply",
] as const;

export type NotificationPreferenceType =
  (typeof NOTIFICATION_PREFERENCE_TYPES)[number];

export type NotificationPreferences = Record<NotificationPreferenceType, boolean>;

export type NotificationPreferenceRow = {
  notification_type: string | null;
  enabled: boolean | null;
};

export const NOTIFICATION_PREFERENCE_META: Record<
  NotificationPreferenceType,
  { title: string; description: string }
> = {
  dm: {
    title: "DM",
    description: "DMが届いたときに通知します。",
  },
  global_chat: {
    title: "掲示板",
    description: "掲示板で自分の投稿に返信されたときに通知します。",
  },
  streak_end: {
    title: "継続終了",
    description: "誰かが継続を終了したときに通知します。",
  },
  result_comment: {
    title: "コメント",
    description: "自分のリザルトやコメントに返信が届いたときに通知します。",
  },
  admin_broadcast: {
    title: "管理者お知らせ",
    description: "管理者からのお知らせを通知します。",
  },
  trophy_unlock: {
    title: "トロフィー",
    description: "トロフィーを獲得したときに通知します。",
  },
  support_reply: {
    title: "問い合わせ返信",
    description: "管理者から問い合わせへの返信が届いたときに通知します。",
  },
};

export function isNotificationPreferenceType(
  value: unknown
): value is NotificationPreferenceType {
  return (
    typeof value === "string" &&
    (NOTIFICATION_PREFERENCE_TYPES as readonly string[]).includes(value)
  );
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    dm: true,
    global_chat: true,
    streak_end: true,
    result_comment: true,
    admin_broadcast: true,
    trophy_unlock: true,
    support_reply: true,
  };
}

export function resolveNotificationPreferences(
  rows: NotificationPreferenceRow[] | null | undefined
): NotificationPreferences {
  const preferences = defaultNotificationPreferences();

  for (const row of rows ?? []) {
    if (!isNotificationPreferenceType(row.notification_type)) continue;
    preferences[row.notification_type] = row.enabled !== false;
  }

  return preferences;
}

export function shouldShowNotificationType(
  preferences: NotificationPreferences,
  type: string
) {
  if (!isNotificationPreferenceType(type)) return true;
  return preferences[type];
}
