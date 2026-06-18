"use client";

import { Ban, KeyRound, RotateCcw, Trash2 } from "lucide-react";
import type { MouseEventHandler } from "react";
import { useFormStatus } from "react-dom";

type Variant = "danger" | "primary" | "secondary" | "outline";
type IconName = "ban" | "delete" | "reset" | "unban";

type Props = {
  idleLabel: string;
  pendingLabel: string;
  variant?: Variant;
  icon?: IconName;
  confirmMessage?: string;
  disabled?: boolean;
};

const variantClass: Record<Variant, string> = {
  danger:
    "bg-destructive text-destructive-foreground hover:opacity-90 disabled:hover:opacity-60",
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 disabled:hover:opacity-60",
  secondary:
    "border border-border bg-background hover:bg-secondary/40 disabled:hover:bg-background",
  outline:
    "border border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300 disabled:hover:bg-red-500/10",
};

function Icon({ name }: { name?: IconName }) {
  if (name === "ban") return <Ban size={16} />;
  if (name === "delete") return <Trash2 size={16} />;
  if (name === "reset") return <KeyRound size={16} />;
  if (name === "unban") return <RotateCcw size={16} />;
  return null;
}

export default function AdminUserSubmitButton({
  idleLabel,
  pendingLabel,
  variant = "secondary",
  icon,
  confirmMessage,
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (isDisabled) {
      event.preventDefault();
      return;
    }

    if (confirmMessage && !window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  };

  return (
    <button
      type="submit"
      disabled={isDisabled}
      onClick={handleClick}
      className={[
        "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variantClass[variant],
      ].join(" ")}
    >
      <Icon name={icon} />
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
