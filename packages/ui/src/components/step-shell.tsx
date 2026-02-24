import type { ReactNode } from "react";

import { Card } from "./card";

type StepShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function StepShell({ eyebrow, title, description, children, footer }: StepShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-6">
      <Card className="space-y-6 p-6 sm:p-7">
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
