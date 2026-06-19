import type { ReactNode } from "react";

export default function Container({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
