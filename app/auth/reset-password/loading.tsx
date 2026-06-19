export default function Loading() {
  return (
    <main className="min-h-svh bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-2 h-6 w-40 rounded bg-secondary/40" />
          <div className="mb-6 h-4 w-72 max-w-full rounded bg-secondary/40" />

          <div className="space-y-3">
            <div className="h-14 rounded bg-secondary/40" />
            <div className="h-14 rounded bg-secondary/40" />
            <div className="h-14 rounded bg-secondary/40" />
            <div className="h-14 rounded bg-secondary/40" />
            <div className="h-14 rounded bg-secondary/40" />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            パスワード再設定を読み込み中...
          </p>
        </div>
      </div>
    </main>
  );
}
