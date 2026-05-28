export default function Loading() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-6 w-48 rounded bg-secondary/40 mb-3" />
          <div className="h-4 w-72 rounded bg-secondary/40 mb-6" />

          <div className="space-y-3">
            <div className="h-12 rounded bg-secondary/40" />
            <div className="h-12 rounded bg-secondary/40" />
            <div className="h-12 rounded bg-secondary/40" />
            <div className="h-12 rounded bg-secondary/40" />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            参加者一覧を読み込み中…
          </p>
        </div>
      </div>
    </main>
  );
}
