import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-[var(--pp-color-primary)] to-[#155dc6] text-[var(--pp-color-primary-foreground)] shadow-[0_10px_20px_rgba(15,106,216,0.24)] hover:translate-y-[-1px] hover:shadow-[0_14px_26px_rgba(15,106,216,0.28)]",
  secondary:
    "bg-[var(--pp-color-surface-strong)] text-[var(--pp-color-text)] border border-[var(--pp-color-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] hover:bg-[var(--pp-color-surface)]",
  ghost: "text-[var(--pp-color-text)] hover:bg-[var(--pp-color-surface)] hover:text-[#0a3f7d]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-[var(--pp-radius-md)] px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pp-color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
