"use client";

import type { FhirPatientSnapshot } from "@packetpilot/fhir";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button, Card, StepShell } from "@packetpilot/ui";

import { AuthGuard } from "@/components/auth-guard";
import { apiRequest } from "@/lib/api";

type CaseStatus = "draft" | "in_review" | "submitted" | "denied";

type CaseRecord = {
  id: number;
  patient_id: string;
  payer_label: string;
  service_line_template_id: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
};

type WorkspaceTab = "requirements" | "evidence" | "form" | "review" | "export";

const TABS: Array<{ id: WorkspaceTab; label: string; description: string }> = [
  {
    id: "requirements",
    label: "Requirements",
    description: "Checklist view will appear here in Epic 4.",
  },
  {
    id: "evidence",
    label: "Evidence",
    description: "Document uploads and extraction pipeline will appear in Epic 5.",
  },
  {
    id: "form",
    label: "Form",
    description: "Questionnaire rendering and field states will appear in Epic 4.",
  },
  {
    id: "review",
    label: "Review",
    description: "Clinician attest workflow will appear in Epic 4.",
  },
  {
    id: "export",
    label: "Export",
    description: "Packet generation and submission artifacts will appear in Epic 6.",
  },
];

function patientName(snapshot: FhirPatientSnapshot | null): string | null {
  if (!snapshot) return null;
  const names = snapshot.patient.name ?? [];
  const first = names[0];
  if (!first) return null;

  if (first.text) return first.text;
  const given = (first.given ?? []).join(" ").trim();
  const family = (first.family ?? "").trim();
  return `${given} ${family}`.trim() || null;
}

function CaseWorkspaceScreen() {
  const params = useParams<{ caseId: string }>();
  const caseId = Number(params.caseId);

  const [selectedTab, setSelectedTab] = useState<WorkspaceTab>("requirements");
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [snapshot, setSnapshot] = useState<FhirPatientSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      try {
        const currentCase = await apiRequest<CaseRecord>(`/cases/${caseId}`, { auth: true });
        if (!active) return;

        setCaseRecord(currentCase);

        const patientSnapshot = await apiRequest<FhirPatientSnapshot>(
          `/fhir/patients/${currentCase.patient_id}/snapshot`,
          { auth: true },
        );
        if (!active) return;

        setSnapshot(patientSnapshot);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load workspace");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      active = false;
    };
  }, [caseId]);

  const activeTab = useMemo(
    () => TABS.find((tab) => tab.id === selectedTab) ?? TABS[0],
    [selectedTab],
  );

  return (
    <StepShell
      eyebrow="Case Workspace"
      title={`Case #${Number.isNaN(caseId) ? "-" : caseId}`}
      description="Review requirements, evidence, and submission steps for this prior auth request."
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/queue">
            <Button variant="secondary">Queue</Button>
          </Link>
          <Link href="/cases/new">
            <Button variant="ghost">New case</Button>
          </Link>
        </div>
        <Link href="/settings">
          <Button variant="ghost">Settings</Button>
        </Link>
      </div>

      {loading ? <p className="text-sm text-[var(--pp-color-muted)]">Loading case workspace...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {caseRecord ? (
        <Card className="space-y-2">
          <p className="text-sm font-semibold">Patient: {patientName(snapshot) ?? caseRecord.patient_id}</p>
          <p className="text-sm text-[var(--pp-color-muted)]">Payer: {caseRecord.payer_label}</p>
          <p className="text-sm text-[var(--pp-color-muted)]">
            Template: {caseRecord.service_line_template_id}
          </p>
          <p className="text-sm text-[var(--pp-color-muted)]">Status: {caseRecord.status}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedTab(tab.id)}
            className={
              selectedTab === tab.id
                ? "rounded-[var(--pp-radius-md)] border border-[var(--pp-color-ring)] bg-white px-3 py-2 text-left text-sm font-semibold"
                : "rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-3 py-2 text-left text-sm"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="space-y-2">
        <h2 className="text-base font-semibold">{activeTab.label}</h2>
        <p className="text-sm text-[var(--pp-color-muted)]">{activeTab.description}</p>
      </Card>
    </StepShell>
  );
}

export default function CaseWorkspacePage() {
  return (
    <AuthGuard>
      <CaseWorkspaceScreen />
    </AuthGuard>
  );
}
