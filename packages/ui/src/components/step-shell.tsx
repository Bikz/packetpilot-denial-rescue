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
        "relative mx-auto flex min-h-screen w-full flex-col px-4 py-6 sm:px-6",
        layout === "workspace"
          ? "max-w-7xl justify-start sm:py-7 lg:px-8 lg:py-8"
          : "max-w-[72ch] justify-center md:px-8",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-b-[44px] bg-gradient-to-b from-white/70 to-transparent" />
      <Card
        className={cn(
          "relative overflow-hidden space-y-6 p-6 sm:p-7 bg-white/78 backdrop-blur-xl shadow-xl border border-white/60",
          layout === "workspace" ? "min-h-[calc(100vh-3rem)] md:p-8 lg:p-8" : "",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--pp-color-ring)]/30 to-transparent" />
        <header className="space-y-3">
          <p className="pp-kicker">
            {eyebrow}
          </p>
          <h1 className="pp-h1">{title}</h1>
          <p className="pp-body-sm max-w-[60ch] text-[var(--pp-color-muted)]">{description}</p>
        </header>

        <section className="space-y-4">{children}</section>

        {footer ? <footer className="pt-2">{footer}</footer> : null}
      </Card>
    </main>
  );
}
