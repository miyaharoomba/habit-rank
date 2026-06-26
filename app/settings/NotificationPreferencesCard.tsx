"use client";

import { useState } from "react";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import {
  NOTIFICATION_PREFERENCE_META,
  NOTIFICATION_PREFERENCE_TYPES,
  type NotificationPreferenceType,
  type NotificationPreferences,
} from "@/app/lib/notificationPreferences";

type Props = {
  initialPreferences: NotificationPreferences;
};

type ApiResponse = {
  preferences?: NotificationPreferences;
  error?: string;
};

export default function NotificationPreferencesCard({
  initialPreferences,
}: Props) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(initialPreferences);
  const [savingType, setSavingType] = useState<NotificationPreferenceType | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const updatePreference = async (
    type: NotificationPreferenceType,
    enabled: boolean
  ) => {
    const next = { ...preferences, [type]: enabled };
    const previous = preferences;

    setPreferences(next);
    setSavingType(type);
    setError(null);

    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: next }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      if (json?.preferences) {
        setPreferences(json.preferences);
      }
    } catch (e) {
      setPreferences(previous);
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSavingType(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">通知設定</h2>
          {savingType ? (
            <span className="text-xs text-muted-foreground">保存中...</span>
          ) : null}
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3">
          {NOTIFICATION_PREFERENCE_TYPES.map((type) => {
            const meta = NOTIFICATION_PREFERENCE_META[type];
            const checked = preferences[type];
            const disabled = savingType !== null;

            return (
              <label
                key={type}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-secondary/20 px-3 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{meta.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {meta.description}
                  </span>
                </span>

                <span className="relative inline-flex shrink-0 items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) =>
                      updatePreference(type, event.currentTarget.checked)
                    }
                    aria-label={`${meta.title}通知`}
                  />
                  <span className="h-7 w-12 rounded-full border border-border bg-muted transition peer-checked:border-primary/70 peer-checked:bg-primary/80 peer-disabled:opacity-60" />
                  <span className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-background shadow transition peer-checked:translate-x-5" />
                </span>
              </label>
            );
          })}
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
