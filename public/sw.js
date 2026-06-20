/* public/sw.js */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Chrome の PWA 判定では fetch handler を持つ Service Worker が必要な環境がある。
// オフラインキャッシュはまだ行わず、通常のネットワーク処理に任せる。
self.addEventListener("fetch", () => {});

/**
 * Payload 例（サーバーから送るJSON）
 * {
 *   "title": "誰かが継続を終了",
 *   "body": "理由: 仕事が忙しい",
 *   "url": "/results/xxxxxxxx-xxxx-....",
 *   "icon": "/icon-192x192.png",
 *   "badge": "/badge-72x72.png"
 * }
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "通知", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "HabitBase";
  const body = data.body || "新しい通知があります";
  const url = data.url || "/app";

  const options = {
    body,
    icon: data.icon || "/icon-192x192.png",
    badge: data.badge || "/badge-72x72.png",
    data: {
      url,
    },
    renotify: true,
    tag: data.tag || `notif:${url}`, // 同系統をまとめたい場合に使える
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * 通知をタップしたら、既存タブがあればフォーカスしてURLへ。
 * 無ければ新規で開く。
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification && event.notification.data && event.notification.data.url) || "/app";
  const absoluteUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });

      // 同一オリジンのウィンドウがあればそれを使う
      for (const client of clientList) {
        if ("focus" in client) {
          // 既存をフォーカスしてナビゲート
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(absoluteUrl);
            } catch {
              // ignore
            }
          }
          return;
        }
      }

      // 無ければ新規で開く
      if (clients.openWindow) {
        await clients.openWindow(absoluteUrl);
      }
    })()
  );
});

/**
 * （任意）subscription が更新された時のイベント
 * ブラウザによっては発火しない/挙動が違うので、まずは空でOK
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  // ここで再購読してサーバーへ登録し直す設計も可能
  // ただし実装は後段でOK
});
