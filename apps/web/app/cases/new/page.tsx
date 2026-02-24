"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, StepShell } from "@packetpilot/ui";

import { AuthGuard } from "@/components/auth-guard";
import { apiRequest } from "@/lib/api";

type FhirPatientSummary = {
  id: string;
  display_name: string;
  birth_date: string | null;
  gender: string | null;
};

type CaseResponse = {
  id: number;
  patient_id: string;
};

const SERVICE_LINE_OPTIONS = [
  {
    id: "imaging-mri-lumbar-spine",
    label: "Imaging: MRI Lumbar Spine",
  },
  {
    id: "medication-glp1",
    label: "Medication: GLP-1",
  },
];

function NewCaseScreen() {
  const router = useRouter();

  const [patients, setPatients] = useState<FhirPatientSummary[]>([]);
  const [patientId, setPatientId] = useState("");
  const [payerLabel, setPayerLabel] = useState("Aetna Gold");
  const [serviceLineTemplateId, setServiceLineTemplateId] = useState(SERVICE_LINE_OPTIONS[0].id);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPatients() {
      try {
        const payload = await apiRequest<FhirPatientSummary[]>("/fhir/patients", { auth: true });
        if (!active) return;

        setPatients(payload);
        if (payload.length > 0) {
          setPatientId(payload[0].id);
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load patients");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPatients();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const created = await apiRequest<CaseResponse>("/cases", {
        method: "POST",
        auth: true,
        body: {
          patient_id: patientId,
          payer_label: payerLabel,
          service_line_template_id: serviceLineTemplateId,
        },
      });

      router.push(`/case/${created.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create case");
      setSubmitting(false);
    }
  }

  return (
    <StepShell
      eyebrow="New Case"
      title="Create prior auth case"
      description="Select a patient, choose a service line template, and create the case workspace."
      footer={
        <div className="flex items-center justify-between">
          <Link href="/queue">
            <Button variant="ghost">Back to queue</Button>
          </Link>
          <Button form="new-case-form" type="submit" disabled={loading || submitting || !patientId}>
            {submitting ? "Creating..." : "Create case"}
          </Button>
        </div>
      }
    >
      <form id="new-case-form" className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm font-medium">
          <span>Patient</span>
          <select
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            disabled={loading || patients.length === 0}
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
          >
            {patients.length === 0 ? <option value="">No patients available</option> : null}
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.display_name} ({patient.id})
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Payer</span>
          <input
            value={payerLabel}
            onChange={(event) => setPayerLabel(event.target.value)}
            required
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
          />
        </label>

        <label className="block space-y-1 text-sm font-medium">
          <span>Service line template</span>
          <select
            value={serviceLineTemplateId}
            onChange={(event) => setServiceLineTemplateId(event.target.value)}
            className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
          >
            {SERVICE_LINE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {loading ? <p className="text-sm text-[var(--pp-color-muted)]">Loading patient roster...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </StepShell>
  );
}

export default function NewCasePage() {
  return (
    <AuthGuard>
      <NewCaseScreen />
    </AuthGuard>
  );
}
