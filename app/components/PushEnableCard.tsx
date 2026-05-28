"use client";

import { useEffect, useMemo, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export default function PushEnableCard() {
  const [supported, setSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const vapidPublicKey = useMemo(
    () => (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim(),
    []
  );

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const enable = async () => {
    setMsg("");

    if (!supported) {
      setMsg("このブラウザはプッシュ通知に対応していません。");
      return;
    }
    if (!vapidPublicKey) {
      setMsg("NEXT_PUBLIC_VAPID_PUBLIC_KEY が未設定です。");
      return;
    }

    setBusy(true);
    try {
      // 1) Service Worker 登録（Push受信に必須）[1](https://github.com/vipulmesh/AttendEase)[2](https://github.com/taniken-dev/attend_app)
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const ready = await navigator.serviceWorker.ready;

      // 2) 通知許可（ユーザー操作で要求する）[2](https://github.com/taniken-dev/attend_app)[1](https://github.com/vipulmesh/AttendEase)
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMsg("通知が許可されませんでした。ブラウザ設定を確認してください。");
        return;
      }

      // 3) 既存購読があれば再利用、なければ購読作成（VAPID公開鍵）[1](https://github.com/vipulmesh/AttendEase)[2](https://github.com/taniken-dev/attend_app)
      const existing = await ready.pushManager.getSubscription();
      const subscription =
        existing ??
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      // 4) サーバへ保存（push_subscriptions に upsert）
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
          userAgent: navigator.userAgent,
          platform: (navigator as any).userAgentData?.platform ?? "",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `subscribe failed (HTTP ${res.status})`);
      }

      // iOS向け注意（PWA要件あり）[3](https://supabase.com/docs/guides/auth/quickstarts/nextjs)[4](https://shiftb.dev/articles/nextjs-supabase-indie-dev)
      setMsg("端末通知を有効化しました。iPhoneはホーム画面に追加したPWAで動作します。");
    } catch (e: any) {
      setMsg(e?.message ?? "登録に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-semibold">端末通知（Web Push）</div>
      <div className="mt-1 text-xs text-muted-foreground">
        DMや継続終了の通知を端末（PC/スマホ）に表示します。
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={!supported || busy}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "設定中..." : "端末通知を有効化"}
        </button>

        <span className="text-xs text-muted-foreground">
          permission: <span className="font-mono">{permission}</span>
        </span>
      </div>

      {msg ? (
        <div className="mt-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs whitespace-pre-wrap">
          {msg}
        </div>
      ) : null}

      {!supported ? (
        <div className="mt-3 text-[11px] text-muted-foreground">
          ※ Service Worker / PushManager / Notification API が必要です。[1](https://github.com/vipulmesh/AttendEase)[2](https://github.com/taniken-dev/attend_app)
        </div>
      ) : null}
    </div>
  );
}
``