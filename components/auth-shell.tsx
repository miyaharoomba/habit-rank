import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-svh bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-md flex-col justify-center gap-6">
        <div className="space-y-2 text-center">
          <div className="text-3xl font-bold tracking-tight">Habit Rank</div>
          <p className="text-sm text-muted-foreground">
            継続を記録して、ランキングと通知で続ける。
          </p>
        </div>

        {children}
      </div>
    </main>
  );
}
