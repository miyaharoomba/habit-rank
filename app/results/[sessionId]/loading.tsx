// app/results/[sessionId]/loading.tsx
export default function Loading() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-6 w-44 rounded bg-secondary/40 mb-2" />
          <div className="h-4 w-64 rounded bg-secondary/40" />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-5 w-24 rounded bg-secondary/40 mb-3" />
          <div className="h-8 w-72 rounded bg-secondary/40 mb-2" />
          <div className="h-4 w-full rounded bg-secondary/40" />
          <div className="h-4 w-5/6 rounded bg-secondary/40 mt-2" />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-5 w-24 rounded bg-secondary/40 mb-3" />
          <div className="h-20 w-full rounded bg-secondary/40" />
        </div>

        <p className="text-xs text-muted-foreground">読み込み中…</p>
      </div>
    </main>
  );
}