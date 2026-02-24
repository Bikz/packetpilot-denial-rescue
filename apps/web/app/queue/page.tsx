"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button, Card, StepShell } from "@packetpilot/ui";

import { AuthGuard } from "@/components/auth-guard";
import { apiRequest } from "@/lib/api";
import { clearSession, getSessionUser } from "@/lib/session";

type CaseStatus = "draft" | "in_review" | "submitted" | "denied";

type CaseRecord = {
  id: number;
  org_id: number;
  patient_id: string;
  payer_label: string;
  service_line_template_id: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
};

function statusLabel(status: CaseStatus): string {
  if (status === "in_review") return "In review";
  if (status === "submitted") return "Submitted";
  if (status === "denied") return "Denied";
  return "Draft";
}

function QueueScreen() {
  const user = useMemo(() => getSessionUser(), []);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadQueue() {
      try {
        const data = await apiRequest<CaseRecord[]>("/cases", { auth: true });
        if (!active) return;
        setCases(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load queue");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadQueue();

    return () => {
      active = false;
    };
  }, []);

  return (
    <StepShell
      eyebrow="Queue"
      title="Prior auth queue"
      description="Track active prior authorization requests and start new cases."
      layout="workspace"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white/90 px-4 py-3 text-sm">
        <div>
          <p className="font-semibold">{user?.full_name ?? "Signed in"}</p>
          <p className="text-[var(--pp-color-muted)]">{user?.email}</p>
        </div>
        <p className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
          {cases.length} active case{cases.length === 1 ? "" : "s"}
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            clearSession();
            window.location.href = "/login";
          }}
        >
          Sign out
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/queue">
            <Button variant="secondary">Queue</Button>
          </Link>
          <Link href="/settings">
            <Button variant="ghost">Settings</Button>
          </Link>
        </div>
        <Link href="/cases/new">
          <Button>New case</Button>
        </Link>
      </div>

      {loading ? <p className="text-sm text-[var(--pp-color-muted)]">Loading queue...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error && cases.length === 0 ? (
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">No cases yet</h2>
          <p className="text-sm text-[var(--pp-color-muted)]">
            Start your first prior auth request to begin assembling requirements and evidence.
          </p>
          <Link href="/cases/new">
            <Button>New Case</Button>
          </Link>
        </Card>
      ) : null}

      {!loading && !error && cases.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cases.map((item) => (
            <Link key={item.id} href={`/case/${item.id}`}>
              <Card className="space-y-3 transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--pp-color-ring)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Case #{item.id}</p>
                  <span className="rounded-full bg-[var(--pp-color-surface-strong)] px-2 py-1 text-xs font-semibold text-[#0a3f7d]">
                    {statusLabel(item.status)}
                  </span>
                </div>
                <p className="text-sm text-[var(--pp-color-muted)]">Patient: {item.patient_id}</p>
                <p className="text-sm text-[var(--pp-color-muted)]">Payer: {item.payer_label}</p>
                <p className="text-xs text-[var(--pp-color-muted)]">
                  Updated {new Date(item.updated_at).toLocaleString()}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </StepShell>
  );
}

export default function QueuePage() {
  return (
    <AuthGuard>
      <QueueScreen />
    </AuthGuard>
  );
}
