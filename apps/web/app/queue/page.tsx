"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { Button, Card, StepShell } from "@packetpilot/ui";

import { AuthGuard } from "@/components/auth-guard";
import { apiRequest } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { WorkspaceFrame } from "@/components/workspace-frame";

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
      <WorkspaceFrame
        user={user}
        caseStatus={`${cases.length} active case${cases.length === 1 ? "" : "s"}`}
        quickActions={[
          { label: "Settings", href: "/settings" },
          { label: "New case", href: "/cases/new", variant: "secondary" },
        ]}
      >
        {loading ? <p className="text-sm text-[var(--pp-color-muted)]">Loading queue...</p> : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}

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

        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.06 },
            },
          }}
        >
          {cases.map((item) => (
            <motion.div
              key={item.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.18 } },
              }}
            >
              <Link href={`/case/${item.id}`}>
                <Card className="h-full space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Case #{item.id}</p>
                    <span className="rounded-full bg-[var(--pp-color-surface)] px-2 py-1 text-xs font-semibold text-[var(--pp-color-primary)]">
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[var(--pp-color-text)]">Patient: {item.patient_id}</p>
                  <p className="text-sm text-[var(--pp-color-muted)]">Payer: {item.payer_label}</p>
                  <p className="text-xs text-[var(--pp-color-muted)] mt-auto pt-2">
                    Updated {new Date(item.updated_at).toLocaleString()}
                  </p>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </WorkspaceFrame>

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
