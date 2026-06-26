export default function Loading() {
  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="h-8 w-32 rounded bg-secondary/40" />
            <div className="mt-2 h-4 w-64 rounded bg-secondary/40" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-20 rounded-lg bg-secondary/40" />
            <div className="h-10 w-20 rounded-lg bg-secondary/40" />
            <div className="h-10 w-24 rounded-lg bg-secondary/40" />
          </div>
        </div>

        {[0, 1].map((item) => (
          <section
            key={item}
            className="rounded-lg border border-border bg-card text-card-foreground"
          >
            <div className="border-b border-border px-4 py-4 sm:px-5">
              <div className="h-5 w-36 rounded bg-secondary/40" />
              <div className="mt-2 h-3 w-48 rounded bg-secondary/40" />
            </div>
            <div className="space-y-5 px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="h-24 rounded-lg bg-secondary/40" />
                <div className="h-24 rounded-lg bg-secondary/40" />
                <div className="h-24 rounded-lg bg-secondary/40" />
                <div className="h-24 rounded-lg bg-secondary/40" />
              </div>
              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                  <div className="h-8 rounded bg-secondary/40" />
                  <div className="h-8 rounded bg-secondary/40" />
                  <div className="h-8 rounded bg-secondary/40" />
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-secondary/40" />
                  <div className="h-16 rounded-lg bg-secondary/40" />
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
