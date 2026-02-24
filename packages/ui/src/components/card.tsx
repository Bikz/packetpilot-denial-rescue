import { type HTMLAttributes } from "react";

import { cn } from "../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--pp-radius-lg)] border border-[var(--pp-color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[var(--pp-shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}
