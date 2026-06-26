import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isNotificationPreferenceType,
  NOTIFICATION_PREFERENCE_TYPES,
  resolveNotificationPreferences,
  type NotificationPreferenceRow,
} from "@/app/lib/notificationPreferences";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("notification_type, enabled")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      {
        preferences: resolveNotificationPreferences(null),
        warning: error.message,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    preferences: resolveNotificationPreferences(data as NotificationPreferenceRow[]),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    preferences?: Record<string, unknown>;
  } | null;

  const rawPreferences = body?.preferences;
  if (!rawPreferences || typeof rawPreferences !== "object") {
    return NextResponse.json({ error: "preferences is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows = Object.entries(rawPreferences)
    .filter(([type]) => isNotificationPreferenceType(type))
    .map(([type, enabled]) => ({
      user_id: user.id,
      notification_type: type,
      enabled: Boolean(enabled),
      updated_at: now,
    }));

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "valid notification type is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(rows, { onConflict: "user_id,notification_type" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: saved } = await supabase
    .from("notification_preferences")
    .select("notification_type, enabled")
    .eq("user_id", user.id)
    .in("notification_type", [...NOTIFICATION_PREFERENCE_TYPES]);

  return NextResponse.json({
    ok: true,
    preferences: resolveNotificationPreferences(saved as NotificationPreferenceRow[]),
  });
}
