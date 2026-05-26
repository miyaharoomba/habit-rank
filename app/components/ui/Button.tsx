import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
};

export default function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold " +
    "transition active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  const styles: Record<Variant, string> = {
    // メイン青
    primary:
      "bg-primary text-primary-foreground shadow-glowBlue hover:bg-primary/90",
    // 透明＋枠（サブボタン）
    ghost:
      "bg-transparent border border-border text-foreground hover:bg-secondary",
    // 危険（赤）
    danger:
      "bg-destructive text-destructive-foreground shadow-glow hover:opacity-90",
  };

  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}