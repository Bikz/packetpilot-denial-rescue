"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { Button } from "@packetpilot/ui";

import { clearSession, type SessionUser } from "@/lib/session";

type WorkspaceAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
};

type WorkspaceFrameProps = {
  user: SessionUser | null;
  caseStatus?: string;
  quickActions: WorkspaceAction[];
  children: ReactNode;
};

const roleBadgeClass: Record<string, string> = {
  admin: "bg-indigo-50 text-indigo-700",
  clinician: "bg-emerald-50 text-emerald-700",
  coordinator: "bg-amber-50 text-amber-700",
};

function ActionButton({ action }: { action: WorkspaceAction }) {
  const node = (
    <Button
      type="button"
      variant={action.variant ?? "ghost"}
      onClick={action.onClick}
      className="h-9 px-3 text-xs"
    >
      {action.label}
    </Button>
  );

  if (action.href) {
    return <Link href={action.href}>{node}</Link>;
  }

  return node;
}

export function WorkspaceFrame({ user, caseStatus, quickActions, children }: WorkspaceFrameProps) {
  const role = user?.role ?? "coordinator";
  const roleClass = roleBadgeClass[role] ?? roleBadgeClass.coordinator;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-[var(--pp-radius-lg)] border border-[var(--pp-color-border)] bg-white/85 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">Workspace</p>
            <p className="text-sm font-semibold">Signed in as {user?.full_name ?? "Guest clinician"}</p>
            <p className="text-xs text-[var(--pp-color-muted)]">{user?.email ?? "offline-session"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${roleClass}`}>
              {role.toUpperCase()}
            </span>
            {caseStatus ? (
              <span className="inline-flex rounded-full border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--pp-color-text)]">
                {caseStatus}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {quickActions.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-xs"
            onClick={() => {
              clearSession();
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
