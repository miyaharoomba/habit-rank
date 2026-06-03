// app/users/[userId]/loading.tsx
export default function Loading() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-6 w-40 rounded bg-secondary/40 mb-2" />
          <div className="h-4 w-56 rounded bg-secondary/40" />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="h-24 w-24 rounded-full bg-secondary/40" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-40 rounded bg-secondary/40" />
              <div className="h-20 w-full rounded-xl bg-secondary/40" />
              <div className="h-4 w-48 rounded bg-secondary/40" />
              <div className="h-4 w-40 rounded bg-secondary/40" />
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">読み込み中…</p>
      </div>
    </main>
  );
}
