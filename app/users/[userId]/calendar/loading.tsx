import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";

export default function Loading() {
  return (
    <Container>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="h-7 w-32 rounded bg-secondary/40 animate-pulse" />
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="h-5 w-40 rounded bg-secondary/40 animate-pulse" />
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-secondary/30 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="h-6 w-40 rounded bg-secondary/40 animate-pulse" />
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
              <div className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``