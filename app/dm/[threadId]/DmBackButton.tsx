"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DmBackButton() {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/dm");
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground transition hover:bg-secondary/50"
      aria-label="戻る"
      title="戻る"
    >
      <ArrowLeft className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}
