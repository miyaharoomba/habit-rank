import type { ReactNode } from "react";

export default function Container({
  children,
  size = "default",
}: {
  children: ReactNode;
  size?: "default" | "wide";
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main
        className={[
          "mx-auto w-full px-4 py-5 sm:px-6 sm:py-8",
          size === "wide" ? "max-w-7xl" : "max-w-5xl",
        ].join(" ")}
      >
        {children}
      </main>
    </div>
  );
}
