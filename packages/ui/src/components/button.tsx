import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--pp-color-primary)] text-[var(--pp-color-primary-foreground)] hover:opacity-90",
  secondary:
    "bg-[var(--pp-color-surface-strong)] text-[var(--pp-color-text)] border border-[var(--pp-color-border)] hover:bg-[var(--pp-color-surface)]",
  ghost: "text-[var(--pp-color-text)] hover:bg-[var(--pp-color-surface)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-[var(--pp-radius-md)] px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pp-color-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
