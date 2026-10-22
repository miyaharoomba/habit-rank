const PUSH_HOSTS = new Set([
  "fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

export function validPushEndpoint(endpoint: string) {
  try {
    if (endpoint.length > 4096) return false;
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (PUSH_HOSTS.has(host) || host.endsWith(".notify.windows.com") || host === "wns.windows.com");
  } catch { return false; }
}

export function validPushKeys(p256dh: string, auth: string) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth)) return false;
  const publicKey = Buffer.from(p256dh, "base64url");
  return publicKey.length === 65 && publicKey[0] === 4 && Buffer.from(auth, "base64url").length === 16;
}
