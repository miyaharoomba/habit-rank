export default function Loading() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-6 w-40 bg-secondary/40 rounded mb-3" />
          <div className="h-4 w-72 bg-secondary/40 rounded mb-6" />
          <div className="space-y-3">
            <div className="h-12 bg-secondary/40 rounded" />
            <div className="h-12 bg-secondary/40 rounded" />
            <div className="h-12 bg-secondary/40 rounded" />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">ランキングを読み込み中...</p>
        </div>
      </div>
    </main>
  );
}