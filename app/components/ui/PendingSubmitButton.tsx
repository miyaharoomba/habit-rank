"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleText: string;
  pendingText: string;
  className?: string;
};

export default function PendingSubmitButton({
  idleText,
  pendingText,
  className,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={className}
    >
      {pending ? pendingText : idleText}
    </button>
  );
}