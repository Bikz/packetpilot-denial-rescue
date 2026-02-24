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
        "relative mx-auto flex min-h-screen w-full flex-col justify-start px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-8",
        "max-w-[75rem]",
        className,
      )}
    >
      <Card
        className={cn(
          "relative overflow-hidden space-y-6 p-6 sm:p-7 bg-[var(--pp-color-card)]",
          layout === "workspace" ? "min-h-[calc(100vh-3rem)] md:p-8 lg:p-8" : "",
        )}
      >
        <header className="space-y-3">
          <p className="pp-kicker">
            {eyebrow}
          </p>
          <h1 className="pp-h1">{title}</h1>
          <p className="pp-body-sm max-w-[60ch] text-[var(--pp-color-text)]">{description}</p>
        </header>

        <section className="space-y-4">{children}</section>

        {footer ? <footer className="pt-2">{footer}</footer> : null}
      </Card>
    </main>
  );
}
