import type { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-card text-card-foreground border border-border shadow-sm">
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-border">{children}</div>;
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="px-4 py-4 sm:px-5">{children}</div>;
}
