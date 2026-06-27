export default function Loading() {
  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-8 w-56 rounded-lg bg-secondary/50" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-secondary/40" />
        <div className="mt-6 h-24 rounded-lg border border-border bg-card" />
        <div className="mt-5 h-96 rounded-lg border border-border bg-card" />
      </div>
    </main>
  );
}
