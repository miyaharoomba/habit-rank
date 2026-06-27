export default function Loading() {
  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-8 w-64 rounded-lg bg-secondary/50" />
        <div className="mt-2 h-4 w-full max-w-lg rounded bg-secondary/40" />
        <div className="mt-6 h-20 rounded-lg border border-border bg-card" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-28 rounded-lg border border-border bg-card" />
          ))}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
          <div className="h-96 rounded-lg border border-border bg-card" />
          <div className="h-96 rounded-lg border border-border bg-card" />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="h-96 rounded-lg border border-border bg-card" />
          <div className="h-96 rounded-lg border border-border bg-card" />
        </div>
      </div>
    </main>
  );
}
