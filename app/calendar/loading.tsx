import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";

export default function Loading() {
  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-9 w-40 rounded-lg bg-secondary/40 animate-pulse" />
          <div className="h-5 w-64 rounded-lg bg-secondary/30 animate-pulse" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="h-7 w-28 rounded-lg bg-secondary/40 animate-pulse" />
              <div className="h-7 w-36 rounded-lg bg-secondary/30 animate-pulse" />
              <div className="h-7 w-28 rounded-lg bg-secondary/40 animate-pulse" />
            </div>
          </CardHeader>

          <CardBody>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl border border-border bg-secondary/20 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="px-4 py-4">
              <div className="h-6 w-40 rounded-lg bg-secondary/40 animate-pulse" />
            </div>
          </CardHeader>

          <CardBody>
            <div className="space-y-3 px-4 pb-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-secondary/20 p-4"
                >
                  <div className="h-5 w-36 rounded bg-secondary/40 animate-pulse" />
                  <div className="mt-3 h-4 w-56 rounded bg-secondary/30 animate-pulse" />
                  <div className="mt-2 h-4 w-40 rounded bg-secondary/30 animate-pulse" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``