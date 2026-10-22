export function authErrorMessage(error: unknown, online = true) {
  if (!online) return "インターネットに接続されていません。接続を確認して、もう一度お試しください。";
  const value = error && typeof error === "object" ? error as { code?: string; message?: string; name?: string; status?: number } : {};
  if (value.code === "invalid_credentials") return "メールアドレスまたはパスワードが正しくありません。";
  if (value.code === "email_not_confirmed") return "確認メールのリンクを開いて、メールアドレスの認証を完了してください。";
  if (value.status === 429 || /rate.limit|too many requests/i.test(value.message ?? "")) return "試行回数が多いため、時間をおいてからお試しください。";
  if (
    value.name === "AbortError" || value.name === "TimeoutError" ||
    /failed to fetch|fetch failed|network|load failed|supabase.*(url|key)/i.test(value.message ?? "") ||
    (value.status !== undefined && value.status >= 500)
  ) return "認証サービスに接続できません。通信状況を確認して、しばらくしてから再度お試しください。改善しない場合は管理者に連絡してください。";
  if (value.code === "weak_password") return "より長く、推測されにくいパスワードを設定してください。";
  return "認証に失敗しました。入力内容を確認して、もう一度お試しください。";
}

export function safeNextPath(input: string | null, fallback = "/app") {
  if (!input?.startsWith("/") || input.includes("\\")) return fallback;
  try {
    const base = "https://habitbase.invalid";
    const url = new URL(input, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch { return fallback; }
}
