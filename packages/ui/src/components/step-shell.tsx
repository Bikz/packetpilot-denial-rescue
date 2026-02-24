import type { ReactNode } from "react";

import { Card } from "./card";
import { cn } from "../lib/cn";

type StepShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  layout?: "compact" | "workspace";
  className?: string;
};

export function StepShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  layout = "compact",
  className,
}: StepShellProps) {
  return (
    <main
      className={cn(
        "relative mx-auto flex min-h-screen w-full flex-col px-4",
        layout === "workspace"
          ? "max-w-6xl justify-start py-6 sm:px-6 lg:px-8"
          : "max-w-md justify-center py-6",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-b-[44px] bg-gradient-to-b from-white/70 to-transparent" />
      <Card
        className={cn(
          "relative overflow-hidden space-y-6 p-6 sm:p-7",
          layout === "workspace" ? "min-h-[calc(100vh-3rem)] lg:p-8" : "",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--pp-color-ring)]/45 to-transparent" />
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-color-muted)]">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-bold leading-tight text-[var(--pp-color-text)]">{title}</h1>
          <p className="text-sm leading-relaxed text-[var(--pp-color-muted)]">{description}</p>
        </header>

        <section className="space-y-4">{children}</section>

        {footer ? <footer className="pt-2">{footer}</footer> : null}
      </Card>
    </main>
  );
}
