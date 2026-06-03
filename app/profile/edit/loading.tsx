// app/profile/edit/loading.tsx
export default function Loading() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-6 w-36 rounded bg-secondary/40 mb-2" />
          <div className="h-4 w-64 rounded bg-secondary/40" />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-5 w-28 rounded bg-secondary/40 mb-3" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="h-24 w-24 rounded-full bg-secondary/40" />

            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-secondary/40" />
                <div className="h-10 w-full rounded bg-secondary/40" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-16 rounded bg-secondary/40" />
                <div className="h-10 w-full rounded bg-secondary/40" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-32 rounded bg-secondary/40" />
                <div className="h-28 w-full rounded bg-secondary/40" />
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <div className="h-10 w-28 rounded bg-secondary/40" />
            <div className="h-10 w-24 rounded bg-secondary/40" />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">読み込み中…</p>
      </div>
    </main>
  );
}