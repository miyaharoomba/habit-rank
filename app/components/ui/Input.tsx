import type { InputHTMLAttributes } from "react";

export default function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;

  return (
    <input
      {...rest}
      className={
        "w-full rounded-lg bg-background border border-input px-3 py-2 text-foreground " +
        "placeholder:text-muted-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background " +
        className
      }
    />
  );
}