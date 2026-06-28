import Container from "@/app/components/ui/Container";

export default function Loading() {
  return (
    <Container>
      <div className="space-y-7 sm:space-y-9">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="h-9 w-40 animate-pulse rounded-lg bg-secondary/40" />
            <div className="mt-2 h-5 w-64 max-w-full animate-pulse rounded-lg bg-secondary/30" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-10 w-20 animate-pulse rounded-lg bg-secondary/30" />
            ))}
          </div>
        </header>

        <section>
          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3 border-y border-border py-4 sm:grid-cols-[48px_1fr_48px] sm:py-5">
            <div className="h-11 w-11 animate-pulse rounded-lg bg-secondary/40 sm:h-12 sm:w-12" />
            <div className="flex flex-col items-center gap-2">
              <div className="h-7 w-32 animate-pulse rounded-lg bg-secondary/40" />
              <div className="h-4 w-40 animate-pulse rounded bg-secondary/30" />
            </div>
            <div className="h-11 w-11 animate-pulse rounded-lg bg-secondary/40 sm:h-12 sm:w-12" />
          </div>

          <div className="mt-4 overflow-hidden border-y border-border">
            <div className="grid grid-cols-7 border-b border-border">
              {Array.from({ length: 7 }).map((_, index) => (
                <div
                  key={index}
                  className="h-9 border-r border-border bg-secondary/20 last:border-r-0"
                />
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-square animate-pulse border-b border-r border-border bg-secondary/10 sm:aspect-auto sm:h-24 [&:nth-child(7n)]:border-r-0"
                />
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border pt-6">
          <div className="h-5 w-24 animate-pulse rounded bg-secondary/30" />
          <div className="mt-2 h-7 w-40 animate-pulse rounded-lg bg-secondary/40" />
          <div className="mt-4 border-y border-border py-5">
            <div className="h-6 w-48 animate-pulse rounded bg-secondary/40" />
            <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded bg-secondary/30" />
          </div>
        </section>
      </div>
    </Container>
  );
}
