import { type HTMLAttributes } from "react";

import { cn } from "../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--pp-radius-lg)] border border-[var(--pp-color-border)] bg-[var(--pp-color-card)] p-6 shadow-[var(--pp-shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}
