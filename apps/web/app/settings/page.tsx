"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, Card, StepShell } from "@packetpilot/ui";

import { AuthGuard } from "@/components/auth-guard";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { apiRequest } from "@/lib/api";
import { getSessionUser } from "@/lib/session";

type DeploymentMode = "standalone" | "smart_on_fhir";

type SettingsResponse = {
  deployment_mode: DeploymentMode;
  fhir_base_url: string | null;
  fhir_auth_type: string | null;
  fhir_auth_config: string | null;
  model_endpoint: string | null;
  updated_at: string;
};

type AuditEvent = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function SettingsScreen() {
  const user = useMemo(() => getSessionUser(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>("standalone");
  const [fhirBaseUrl, setFhirBaseUrl] = useState("");
  const [fhirAuthType, setFhirAuthType] = useState("");
  const [fhirAuthConfig, setFhirAuthConfig] = useState("");
  const [modelEndpoint, setModelEndpoint] = useState("");

  async function loadData() {
    const [settings, auditEvents] = await Promise.all([
      apiRequest<SettingsResponse>("/settings/current", { auth: true }),
      apiRequest<AuditEvent[]>("/audit-events", { auth: true }),
    ]);

    return { settings, auditEvents };
  }

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const { settings, auditEvents } = await loadData();
        if (!active) return;

        setDeploymentMode(settings.deployment_mode);
        setFhirBaseUrl(settings.fhir_base_url ?? "");
        setFhirAuthType(settings.fhir_auth_type ?? "");
        setFhirAuthConfig(settings.fhir_auth_config ?? "");
        setModelEndpoint(settings.model_endpoint ?? "");
        setEvents(auditEvents);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await apiRequest<SettingsResponse>("/settings/current", {
        method: "PUT",
        auth: true,
        body: {
          deployment_mode: deploymentMode,
          fhir_base_url: fhirBaseUrl || null,
          fhir_auth_type: fhirAuthType || null,
          fhir_auth_config: fhirAuthConfig || null,
          model_endpoint: modelEndpoint || null,
        },
      });

      setToast("Settings saved successfully");
      setTimeout(() => setToast(null), 2200);
      const { settings, auditEvents } = await loadData();
      setDeploymentMode(settings.deployment_mode);
      setFhirBaseUrl(settings.fhir_base_url ?? "");
      setFhirAuthType(settings.fhir_auth_type ?? "");
      setFhirAuthConfig(settings.fhir_auth_config ?? "");
      setModelEndpoint(settings.model_endpoint ?? "");
      setEvents(auditEvents);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Save failed");
    }
  }

  if (loading) {
    return (
      <StepShell
        eyebrow="Settings"
        title="Loading configuration"
        description="Fetching organization settings and audit events."
      >
        <p className="text-sm text-[var(--pp-color-muted)]">Please wait.</p>
      </StepShell>
    );
  }

  return (
    <StepShell
      eyebrow="Settings"
      title="Clinic configuration"
      description="Manage deployment, FHIR placeholders, and model endpoint settings."
      layout="workspace"
    >
      <WorkspaceFrame
        user={user}
        caseStatus="Settings"
        quickActions={[
          { label: "Queue", href: "/queue" },
          { label: "New case", href: "/cases/new", variant: "secondary" },
        ]}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-1 text-sm font-medium">
              <span>Deployment mode</span>
              <select
                value={deploymentMode}
                onChange={(event) => setDeploymentMode(event.target.value as DeploymentMode)}
                className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
              >
                <option value="standalone">Standalone</option>
                <option value="smart_on_fhir">SMART-on-FHIR</option>
              </select>
            </label>

            <label className="block space-y-1 text-sm font-medium">
              <span>FHIR base URL</span>
              <input
                value={fhirBaseUrl}
                onChange={(event) => setFhirBaseUrl(event.target.value)}
                placeholder="https://fhir.yourclinic.example"
                className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
              />
            </label>

            <label className="block space-y-1 text-sm font-medium">
              <span>FHIR auth type</span>
              <input
                value={fhirAuthType}
                onChange={(event) => setFhirAuthType(event.target.value)}
                placeholder="oauth2"
                className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
              />
            </label>

            <label className="block space-y-1 text-sm font-medium">
              <span>FHIR auth config (placeholder)</span>
              <textarea
                value={fhirAuthConfig}
                onChange={(event) => setFhirAuthConfig(event.target.value)}
                placeholder="scope=patient/*.read"
                className="min-h-24 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3 py-2"
              />
            </label>

            <label className="block space-y-1 text-sm font-medium">
              <span>Model endpoint</span>
              <input
                value={modelEndpoint}
                onChange={(event) => setModelEndpoint(event.target.value)}
                placeholder="http://localhost:11434/medgemma"
                className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
              />
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit">Save settings</Button>
          </form>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Audit events</h2>
            <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
              {events.length === 0 ? (
                <p className="text-sm text-[var(--pp-color-muted)]">No audit events yet.</p>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-3 py-2 text-xs"
                  >
                    <p className="font-semibold">
                      {event.action} · {event.entity_type}
                    </p>
                    <p className="text-[var(--pp-color-muted)]">
                      {event.actor_email ?? "system"} · {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {toast ? (
          <p role="status" className="rounded-[var(--pp-radius-md)] bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
            {toast}
          </p>
        ) : null}
      </WorkspaceFrame>
    </StepShell>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsScreen />
    </AuthGuard>
  );
}
