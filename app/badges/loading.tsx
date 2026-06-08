import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";

export default function Loading() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-9 w-48 rounded-lg bg-secondary/40 animate-pulse" />
          <div className="h-5 w-72 rounded-lg bg-secondary/30 animate-pulse" />
        </div>

        <Card>
          <CardHeader>
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-4 w-20 rounded bg-secondary/30 animate-pulse" />
                  <div className="h-8 w-24 rounded bg-secondary/40 animate-pulse" />
                </div>
                <div className="h-5 w-12 rounded bg-secondary/30 animate-pulse" />
              </div>

              <div className="h-3 w-full rounded-full bg-secondary/30 animate-pulse" />

              <div className="flex gap-2">
                <div className="h-4 w-10 rounded bg-secondary/30 animate-pulse" />
                <div className="h-4 w-10 rounded bg-secondary/30 animate-pulse" />
                <div className="h-4 w-10 rounded bg-secondary/30 animate-pulse" />
                <div className="h-4 w-10 rounded bg-secondary/30 animate-pulse" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2 px-4 py-4">
              <div className="h-10 w-28 rounded-lg bg-secondary/30 animate-pulse" />
              <div className="h-10 w-28 rounded-lg bg-secondary/30 animate-pulse" />
            </div>
          </CardHeader>

          <CardBody>
            <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-secondary/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="h-4 w-16 rounded bg-secondary/30 animate-pulse" />
                      <div className="h-6 w-28 rounded bg-secondary/40 animate-pulse" />
                    </div>
                    <div className="h-6 w-6 rounded bg-secondary/30 animate-pulse" />
                  </div>

                  <div className="mt-3 h-4 w-full rounded bg-secondary/30 animate-pulse" />
                  <div className="mt-2 h-4 w-4/5 rounded bg-secondary/30 animate-pulse" />
                  <div className="mt-4 h-3 w-32 rounded bg-secondary/30 animate-pulse" />
                  <div className="mt-2 h-3 w-24 rounded bg-secondary/30 animate-pulse" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}