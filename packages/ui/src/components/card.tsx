import React, { type HTMLAttributes } from "react";

import { cn } from "../lib/cn";

export const Card = React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--pp-radius-lg)] bg-[var(--pp-color-card)] text-[var(--pp-color-text)] shadow-[var(--pp-shadow-sm)] transition-all duration-250",
        className,
      )}
      {...props}
    />
  )
);

Card.displayName = "Card";
