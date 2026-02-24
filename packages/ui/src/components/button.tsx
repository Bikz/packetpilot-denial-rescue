import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "link";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--pp-color-primary)] text-[var(--pp-color-primary-foreground)] shadow-[var(--pp-shadow-sm)] hover:shadow-[var(--pp-shadow-md)] hover:translate-y-[-1px] active:translate-y-0.5 active:shadow-[var(--pp-shadow-sm)]",
  secondary:
    "bg-[var(--pp-color-surface)] text-[var(--pp-color-text)] border border-[var(--pp-color-border)] hover:bg-[var(--pp-color-surface-strong)] active:bg-[var(--pp-color-card)]",
  outline:
    "bg-transparent text-[var(--pp-color-text)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] hover:bg-[var(--pp-color-surface-strong)] active:bg-[var(--pp-color-card)]",
  ghost: "bg-transparent text-[var(--pp-color-text)] hover:bg-[var(--pp-color-surface)] hover:text-[var(--pp-color-text)] active:bg-[var(--pp-color-surface-strong)]",
  link: "text-[var(--pp-color-primary)] underline-offset-4 hover:underline",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-11 min-h-11 items-center justify-center rounded-[var(--pp-radius-md)] px-5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pp-color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
