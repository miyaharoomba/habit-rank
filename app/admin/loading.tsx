export default function Loading() {
  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-8 w-64 rounded-lg bg-secondary/50" />
        <div className="mt-2 h-4 w-full max-w-lg rounded bg-secondary/40" />
        <div className="mt-6 h-20 rounded-lg border border-border bg-card" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-10 w-24 rounded-lg border border-border bg-card" />
          ))}
        </div>
        <div className="mt-4 h-24 rounded-lg border border-border bg-card" />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="h-80 rounded-lg border border-border bg-card" />
          <div className="h-80 rounded-lg border border-border bg-card" />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="h-72 rounded-lg border border-border bg-card" />
          <div className="h-72 rounded-lg border border-border bg-card" />
        </div>
      </div>
    </main>
  );
}
