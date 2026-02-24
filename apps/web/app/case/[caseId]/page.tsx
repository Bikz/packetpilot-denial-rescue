"use client";

import type { FhirPatientSnapshot } from "@packetpilot/fhir";
import {
  getServiceLineTemplate,
  getTemplateFieldIds,
  type QuestionnaireItem,
  type ServiceLineTemplate,
} from "@packetpilot/templates";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button, Card, StepShell } from "@packetpilot/ui";

import {
  CitationDrawer,
  type AutofillFieldFill,
  type Citation,
} from "@/components/citation-drawer";
import { AuthGuard } from "@/components/auth-guard";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { apiRequest } from "@/lib/api";
import { getSessionUser } from "@/lib/session";

type CaseStatus = "draft" | "in_review" | "submitted" | "denied";
type FieldState = "missing" | "filled" | "verified";
type WorkspaceTab = "requirements" | "evidence" | "form" | "review" | "export";

type CaseRecord = {
  id: number;
  patient_id: string;
  payer_label: string;
  service_line_template_id: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
};

type QuestionnaireAnswer = {
  value: string | null;
  state: FieldState;
  note: string | null;
};

type QuestionnaireOption = { label: string; value: string };

type QuestionnaireSection = {
  id: string;
  title: string;
  description: string;
  items: Array<{
    field_id: string;
    label: string;
    type: string;
    required: boolean;
    placeholder: string | null;
    options: QuestionnaireOption[];
  }>;
};

type EvidenceChecklistItem = {
  id: string;
  label: string;
  description: string;
  required: boolean;
};

type CaseQuestionnaire = {
  case_id: number;
  template_id: string;
  required_field_ids: string[];
  sections: QuestionnaireSection[];
  evidence_checklist: EvidenceChecklistItem[];
  answers: Record<string, QuestionnaireAnswer>;
  missing_required_field_ids: string[];
  attested_at: string | null;
  attested_by_email: string | null;
  export_enabled: boolean;
};

type CaseDocumentListItem = {
  id: number;
  case_id: number;
  filename: string;
  content_type: string;
  document_kind: string;
  text_preview: string;
  snippets: Citation[];
  created_at: string;
};

type CaseDocumentDetail = {
  id: number;
  case_id: number;
  filename: string;
  content_type: string;
  document_kind: string;
  extracted_text: string;
  snippets: Citation[];
  created_at: string;
};

type AutofillRun = {
  case_id: number;
  fills: AutofillFieldFill[];
};

type GapReportItem = {
  item: string;
  status: "missing" | "resolved";
};

type DenialAnalysis = {
  case_id: number;
  denial_document_id: number;
  reasons: string[];
  missing_items: string[];
  gap_report: GapReportItem[];
  reference_id: string | null;
  deadline_text: string | null;
  citations: Citation[];
  appeal_letter_draft: string;
};

type PacketExportRecord = {
  export_id: number;
  case_id: number;
  export_type: "initial" | "appeal";
  metrics_json: Record<string, unknown>;
  created_at: string;
};

type PacketExportDetail = {
  export_id: number;
  case_id: number;
  export_type: "initial" | "appeal";
  packet_json: Record<string, unknown>;
  metrics_json: Record<string, unknown>;
  pdf_base64: string;
  created_at: string;
};

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "requirements", label: "Requirements" },
  { id: "evidence", label: "Evidence" },
  { id: "form", label: "Form" },
  { id: "review", label: "Review" },
  { id: "export", label: "Export" },
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

function defaultAnswers(template: ServiceLineTemplate): Record<string, QuestionnaireAnswer> {
  return Object.fromEntries(
    getTemplateFieldIds(template).map((fieldId) => [
      fieldId,
      {
        value: null,
        state: "missing" as FieldState,
        note: null,
      },
    ]),
  );
}

function statusLabel(status: CaseStatus): string {
  if (status === "in_review") return "In review";
  if (status === "submitted") return "Submitted";
  if (status === "denied") return "Denied";
  return "Draft";
}

function normalizeAnswers(
  template: ServiceLineTemplate,
  incoming: Record<string, QuestionnaireAnswer> | undefined,
): Record<string, QuestionnaireAnswer> {
  const base = defaultAnswers(template);
  if (!incoming) return base;

  for (const [fieldId, answer] of Object.entries(incoming)) {
    if (!base[fieldId]) continue;
    base[fieldId] = {
      value: answer.value,
      state: answer.state,
      note: answer.note,
    };
  }

  return base;
}

function CaseWorkspaceScreen() {
  const params = useParams<{ caseId: string }>();
  const caseId = Number(params.caseId);
  const user = useMemo(() => getSessionUser(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const denialInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedTab, setSelectedTab] = useState<WorkspaceTab>("requirements");
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [snapshot, setSnapshot] = useState<FhirPatientSnapshot | null>(null);
  const [questionnaire, setQuestionnaire] = useState<CaseQuestionnaire | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuestionnaireAnswer>>({});
  const [documents, setDocuments] = useState<CaseDocumentListItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<CaseDocumentDetail | null>(null);
  const [autofill, setAutofill] = useState<AutofillRun>({ case_id: caseId, fills: [] });
  const [openCitationFieldId, setOpenCitationFieldId] = useState<string | null>(null);
  const [denial, setDenial] = useState<DenialAnalysis | null>(null);
  const [exports, setExports] = useState<PacketExportRecord[]>([]);
  const [exportDownloads, setExportDownloads] = useState<Record<number, PacketExportDetail>>({});

  const [attestChecked, setAttestChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [formSectionId, setFormSectionId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadingDenial, setUploadingDenial] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [exportingType, setExportingType] = useState<"initial" | "appeal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const template = useMemo(
    () => (caseRecord ? getServiceLineTemplate(caseRecord.service_line_template_id) : null),
    [caseRecord],
  );

  const autofillByFieldId = useMemo(() => {
    const map = new Map<string, AutofillFieldFill>();
    for (const fill of autofill.fills) {
      map.set(fill.field_id, fill);
    }
    return map;
  }, [autofill]);
  const evidenceDocuments = useMemo(
    () => documents.filter((document) => document.document_kind === "evidence"),
    [documents],
  );

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      try {
        const currentCase = await apiRequest<CaseRecord>(`/cases/${caseId}`, { auth: true });
        if (!active) return;
        setCaseRecord(currentCase);

        const [patientSnapshot, caseQuestionnaire, caseDocuments, caseAutofill, caseExports] =
          await Promise.all([
            apiRequest<FhirPatientSnapshot>(`/fhir/patients/${currentCase.patient_id}/snapshot`, {
              auth: true,
            }),
            apiRequest<CaseQuestionnaire>(`/cases/${caseId}/questionnaire`, { auth: true }),
            apiRequest<CaseDocumentListItem[]>(`/cases/${caseId}/documents`, { auth: true }),
            apiRequest<AutofillRun>(`/cases/${caseId}/autofill`, { auth: true }),
            apiRequest<PacketExportRecord[]>(`/cases/${caseId}/exports`, { auth: true }),
          ]);

        let currentDenial: DenialAnalysis | null = null;
        try {
          currentDenial = await apiRequest<DenialAnalysis>(`/cases/${caseId}/denial`, { auth: true });
        } catch {
          currentDenial = null;
        }

        if (!active) return;

        setSnapshot(patientSnapshot);
        setQuestionnaire(caseQuestionnaire);
        setDocuments(caseDocuments);
        setAutofill(caseAutofill);
        setExports(caseExports);
        setExportDownloads({});
        setDenial(currentDenial);

        const loadedTemplate = getServiceLineTemplate(currentCase.service_line_template_id);
        if (loadedTemplate) {
          setAnswers(normalizeAnswers(loadedTemplate, caseQuestionnaire.answers));
        }

        if (caseDocuments.length > 0) {
          setSelectedDocId(caseDocuments[0].id);
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load workspace");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (!Number.isNaN(caseId)) {
      void loadWorkspace();
    }

    return () => {
      active = false;
    };
  }, [caseId]);

  useEffect(() => {
    if (!selectedDocId || !caseRecord) {
      setSelectedDocument(null);
      return;
    }

    let active = true;
    apiRequest<CaseDocumentDetail>(`/cases/${caseRecord.id}/documents/${selectedDocId}`, { auth: true })
      .then((document) => {
        if (active) setSelectedDocument(document);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Failed to load document");
      });

    return () => {
      active = false;
    };
  }, [selectedDocId, caseRecord]);

  const itemByFieldId = useMemo(() => {
    const map = new Map<string, QuestionnaireItem>();
    if (!template) return map;

    for (const section of template.questionnaire.sections) {
      for (const item of section.items) {
        map.set(item.fieldId, item);
      }
    }
    return map;
  }, [template]);

  function updateAnswer(fieldId: string, patch: Partial<QuestionnaireAnswer>) {
    setAnswers((current) => ({
      ...current,
      [fieldId]: {
        ...current[fieldId],
        ...patch,
      },
    }));
  }

  async function refreshQuestionnaire() {
    if (!caseRecord || !template) return;

    const latest = await apiRequest<CaseQuestionnaire>(`/cases/${caseRecord.id}/questionnaire`, { auth: true });
    setQuestionnaire(latest);
    setAnswers(normalizeAnswers(template, latest.answers));
  }

  async function refreshDocuments() {
    if (!caseRecord) return;

    const latest = await apiRequest<CaseDocumentListItem[]>(`/cases/${caseRecord.id}/documents`, {
      auth: true,
    });
    setDocuments(latest);
    if (!selectedDocId && latest.length > 0) {
      setSelectedDocId(latest[0].id);
    }
  }

  async function refreshDenial() {
    if (!caseRecord) return;
    try {
      const latest = await apiRequest<DenialAnalysis>(`/cases/${caseRecord.id}/denial`, { auth: true });
      setDenial(latest);
    } catch {
      setDenial(null);
    }
  }

  async function refreshExports() {
    if (!caseRecord) return;
    const latest = await apiRequest<PacketExportRecord[]>(`/cases/${caseRecord.id}/exports`, {
      auth: true,
    });
    setExports(latest);
  }

  async function fetchExportDetail(exportId: number): Promise<PacketExportDetail> {
    const cached = exportDownloads[exportId];
    if (cached) return cached;
    if (!caseRecord) {
      throw new Error("Case not loaded");
    }
    const detail = await apiRequest<PacketExportDetail>(
      `/cases/${caseRecord.id}/exports/${exportId}`,
      { auth: true },
    );
    setExportDownloads((current) => ({ ...current, [exportId]: detail }));
    return detail;
  }

  async function handleSaveAnswers() {
    if (!caseRecord || !template) return;

    setSaving(true);
    setError(null);

    try {
      const payload = await apiRequest<CaseQuestionnaire>(`/cases/${caseRecord.id}/questionnaire`, {
        method: "PUT",
        auth: true,
        body: { answers },
      });
      setQuestionnaire(payload);
      setAnswers(normalizeAnswers(template, payload.answers));
      setToast("Questionnaire saved");
      setTimeout(() => setToast(null), 2200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save questionnaire");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadDocument() {
    if (!caseRecord) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const uploaded = await apiRequest<CaseDocumentDetail>(
        `/cases/${caseRecord.id}/documents/upload`,
        {
          method: "POST",
          auth: true,
          body: form,
        },
      );

      await refreshDocuments();
      setSelectedDocId(uploaded.id);
      setToast("Document uploaded");
      setTimeout(() => setToast(null), 2200);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  async function handleRunAutofill() {
    if (!caseRecord || !template) return;

    setAutofilling(true);
    setError(null);

    try {
      const payload = await apiRequest<AutofillRun>(`/cases/${caseRecord.id}/autofill`, {
        method: "POST",
        auth: true,
      });
      setAutofill(payload);
      await refreshQuestionnaire();
      setToast("Autofill complete. Model output is a draft; verify each field.");
      setTimeout(() => setToast(null), 2800);
    } catch (autofillError) {
      setError(autofillError instanceof Error ? autofillError.message : "Autofill failed");
    } finally {
      setAutofilling(false);
    }
  }

  async function handleUploadDenialLetter() {
    if (!caseRecord) return;
    const file = denialInputRef.current?.files?.[0];
    if (!file) return;

    setUploadingDenial(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const payload = await apiRequest<DenialAnalysis>(`/cases/${caseRecord.id}/denial/upload`, {
        method: "POST",
        auth: true,
        body: form,
      });
      setDenial(payload);
      await refreshDenial();
      await refreshDocuments();
      setSelectedDocId(payload.denial_document_id);
      setToast("Denial letter parsed and gap report generated.");
      setTimeout(() => setToast(null), 2600);
      if (denialInputRef.current) {
        denialInputRef.current.value = "";
      }
    } catch (denialError) {
      setError(denialError instanceof Error ? denialError.message : "Failed to parse denial letter");
    } finally {
      setUploadingDenial(false);
    }
  }

  function downloadText(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadBase64(filename: string, base64Content: string, mimeType: string) {
    const binary = window.atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleGenerateExport(exportType: "initial" | "appeal") {
    if (!caseRecord) return;

    setExportingType(exportType);
    setError(null);

    try {
      const payload = await apiRequest<PacketExportDetail>(`/cases/${caseRecord.id}/exports/generate`, {
        method: "POST",
        auth: true,
        body: { export_type: exportType },
      });

      setExportDownloads((current) => ({ ...current, [payload.export_id]: payload }));
      setExports((current) => [
        {
          export_id: payload.export_id,
          case_id: payload.case_id,
          export_type: payload.export_type,
          metrics_json: payload.metrics_json,
          created_at: payload.created_at,
        },
        ...current.filter((item) => item.export_id !== payload.export_id),
      ]);
      setToast(exportType === "appeal" ? "Appeal packet generated" : "Packet generated");
      setTimeout(() => setToast(null), 2400);
      await refreshExports();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to generate export");
    } finally {
      setExportingType(null);
    }
  }

  async function handleAttest() {
    if (!caseRecord) return;

    setAttesting(true);
    setError(null);

    try {
      const payload = await apiRequest<CaseQuestionnaire>(`/cases/${caseRecord.id}/attest`, {
        method: "POST",
        auth: true,
      });
      setQuestionnaire(payload);
      setToast("Case attested successfully");
      setTimeout(() => setToast(null), 2200);
      setAttestChecked(false);
    } catch (attestError) {
      setError(attestError instanceof Error ? attestError.message : "Failed to attest case");
    } finally {
      setAttesting(false);
    }
  }

  function renderFieldInput(item: QuestionnaireItem, answer: QuestionnaireAnswer) {
    if (item.type === "textarea") {
      return (
        <textarea
          value={answer.value ?? ""}
          placeholder={item.placeholder}
          onChange={(event) => updateAnswer(item.fieldId, { value: event.target.value || null })}
          className="min-h-24 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3 py-2"
        />
      );
    }

    if (item.type === "select") {
      return (
        <select
          value={answer.value ?? ""}
          onChange={(event) => updateAnswer(item.fieldId, { value: event.target.value || null })}
          className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
        >
          <option value="">Select an option</option>
          {item.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={item.type === "date" ? "date" : "text"}
        value={answer.value ?? ""}
        placeholder={item.placeholder}
        onChange={(event) => updateAnswer(item.fieldId, { value: event.target.value || null })}
        className="h-11 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3"
      />
    );
  }

  const activeTab = TABS.find((tab) => tab.id === selectedTab) ?? TABS[0];
  const openFill = openCitationFieldId ? autofillByFieldId.get(openCitationFieldId) ?? null : null;
  const openFieldLabel = openCitationFieldId
    ? (itemByFieldId.get(openCitationFieldId)?.label ?? openCitationFieldId)
    : "";

  useEffect(() => {
    if (template?.questionnaire.sections[0]) {
      setFormSectionId(template.questionnaire.sections[0].id);
    }
  }, [template]);

  function getFieldValidationState(answer: QuestionnaireAnswer, fill: AutofillFieldFill | null) {
    if (answer.state === "verified") {
      return {
        icon: "✓",
        label: "Verified",
        badge: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        helper: "Clinician confirmed this value.",
        helperClass: "text-emerald-700",
      };
    }

    if (answer.state === "filled" || fill?.status === "autofilled" || fill?.status === "suggested") {
      return {
        icon: "↻",
        label: "Needs review",
        badge: "bg-amber-100 text-amber-700 border border-amber-200",
        helper: fill?.status ? "AI draft or manual entry awaiting review." : "Manual entry needs confirmation.",
        helperClass: "text-amber-700",
      };
    }

    return {
      icon: "!",
      label: "Missing",
      badge: "bg-rose-100 text-rose-700 border border-rose-200",
      helper: "Collect or infer this field before export.",
      helperClass: "text-rose-700",
    };
  }

  function scrollToSection(sectionId: string) {
    const section = document.getElementById(`section-${sectionId}`);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    setFormSectionId(sectionId);
  }

  function DraftSafetyBanner() {
    return (
      <div className="rounded-[var(--pp-radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-semibold">Draft AI output</p>
        <p>Clinician review is required before submission or export.</p>
      </div>
    );
  }

  return (
    <StepShell
      eyebrow="Case Workspace"
      title={`Case #${Number.isNaN(caseId) ? "-" : caseId}`}
      description="Complete requirements, ingest evidence, and verify model-assisted field fills."
      layout="workspace"
    >
      <WorkspaceFrame
        user={user}
        caseStatus={caseRecord ? `${statusLabel(caseRecord.status)} • ${caseRecord.payer_label}` : "Case loading"}
        quickActions={[
          { label: "Queue", href: "/queue", variant: "ghost" },
          { label: "Settings", href: "/settings", variant: "ghost" },
          { label: "New case", href: "/cases/new", variant: "secondary" },
        ]}
      >
        {loading ? <p className="text-sm text-[var(--pp-color-muted)]">Loading case workspace...</p> : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}

        {caseRecord ? (
          <Card className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">Patient</p>
              <p className="text-sm font-semibold">{patientName(snapshot) ?? caseRecord.patient_id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">Payer</p>
              <p className="text-sm">{caseRecord.payer_label}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">Template</p>
              <p className="text-sm">{caseRecord.service_line_template_id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">Status</p>
              <p className="text-sm font-semibold capitalize">{caseRecord.status.replace("_", " ")}</p>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-2 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white/80 p-2 sm:grid-cols-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id)}
              className={
                selectedTab === tab.id
                  ? "rounded-[var(--pp-radius-md)] border border-[var(--pp-color-ring)] bg-gradient-to-b from-white to-[#f3f8ff] px-3 py-2 text-left text-sm font-semibold text-[#0a3f7d]"
                  : "rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-3 py-2 text-left text-sm text-[var(--pp-color-muted)] hover:text-[var(--pp-color-text)]"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!template ? (
          <Card>
            <p className="text-sm text-rose-700">
              Template not supported in this build: {caseRecord?.service_line_template_id}
            </p>
          </Card>
        ) : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {template && activeTab.id === "requirements" ? (
            <Card className="space-y-4">
              <h2 className="text-base font-semibold">Requirements Checklist</h2>
              <p className="pp-caption text-[var(--pp-color-muted)]">
                Status states map to missing, needs review, and verified across required clinical fields.
              </p>
              <div className="space-y-2">
                {template.requiredFieldIds.map((fieldId) => {
                  const item = itemByFieldId.get(fieldId);
                  const answer = answers[fieldId];
                  const statusState = getFieldValidationState(
                    answer ?? ({ value: null, state: "missing", note: null } as QuestionnaireAnswer),
                    autofillByFieldId.get(fieldId) ?? null,
                  );
                  return (
                    <div
                      key={fieldId}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item?.label ?? fieldId}</p>
                        <p className={`text-xs ${statusState.helperClass}`}>{statusState.helper}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${statusState.badge}`}>
                        {statusState.icon} {statusState.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <h3 className="text-sm font-semibold">Evidence checklist</h3>
              <div className="space-y-2">
                {template.evidenceChecklist.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-3 py-2"
                  >
                    <p className="text-sm font-medium">
                      {item.label} {item.required ? "(Required)" : "(Optional)"}
                    </p>
                    <p className="text-xs text-[var(--pp-color-muted)]">{item.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {template && activeTab.id === "evidence" ? (
            <Card className="space-y-4">
              <h2 className="text-base font-semibold">Evidence</h2>

              <div className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] p-3">
                <p className="text-sm font-semibold">Upload evidence document</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.png,.jpg,.jpeg" />
                  <Button onClick={handleUploadDocument} disabled={uploading}>
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Documents</p>
                  {documents.length === 0 ? (
                    <p className="text-sm text-[var(--pp-color-muted)]">No evidence documents uploaded.</p>
                  ) : (
                    documents.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => setSelectedDocId(document.id)}
                        className={
                          selectedDocId === document.id
                            ? "w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-ring)] bg-white px-3 py-2 text-left"
                            : "w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-3 py-2 text-left"
                        }
                      >
                        <p className="text-sm font-semibold">{document.filename}</p>
                        <p className="text-xs text-[var(--pp-color-muted)] capitalize">
                          {document.document_kind.replace("_", " ")}
                        </p>
                        <p className="text-xs text-[var(--pp-color-muted)]">{document.text_preview || "No preview"}</p>
                      </button>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Document viewer</p>
                  {!selectedDocument ? (
                    <p className="text-sm text-[var(--pp-color-muted)]">Select a document to inspect extracted text.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] px-3 py-2">
                        <p className="text-sm font-semibold">{selectedDocument.filename}</p>
                        <p className="text-xs text-[var(--pp-color-muted)]">{selectedDocument.content_type}</p>
                      </div>

                      <div className="max-h-44 overflow-auto rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white p-3 text-xs leading-relaxed whitespace-pre-wrap">
                        {selectedDocument.extracted_text || "No text extracted"}
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">
                          Detected snippets
                        </p>
                        <div className="space-y-1">
                          {selectedDocument.snippets.length === 0 ? (
                            <p className="text-xs text-[var(--pp-color-muted)]">No snippets detected.</p>
                          ) : (
                            selectedDocument.snippets.map((snippet, index) => (
                              <p
                                key={`${snippet.doc_id}-${snippet.start}-${index}`}
                                className="rounded bg-amber-50 px-2 py-1 text-xs"
                              >
                                {snippet.excerpt}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] p-3">
                <p className="text-sm font-semibold">Upload denial letter (Fix-forward / appeal)</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input ref={denialInputRef} type="file" accept=".txt,.md,.pdf,.png,.jpg,.jpeg" />
                  <Button onClick={handleUploadDenialLetter} disabled={uploadingDenial}>
                    {uploadingDenial ? "Parsing..." : "Upload denial letter"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-[var(--pp-color-muted)]">
                  Parses denial reasons and missing items to generate a gap report + appeal draft.
                </p>
              </div>

              {denial ? (
                <div className="space-y-3 rounded-[var(--pp-radius-md)] border border-amber-300 bg-amber-50 p-3">
                  <h3 className="text-sm font-semibold">Gap report</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">
                        Reasons
                      </p>
                      {denial.reasons.map((reason) => (
                        <p key={reason} className="rounded bg-white px-2 py-1 text-xs">
                          {reason}
                        </p>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">
                        Missing items
                      </p>
                      {denial.gap_report.map((item) => (
                        <p key={item.item} className="rounded bg-white px-2 py-1 text-xs">
                          {item.item} ({item.status})
                        </p>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--pp-color-muted)]">
                    Ref: {denial.reference_id ?? "N/A"} · Deadline: {denial.deadline_text ?? "N/A"}
                  </p>
                  <div className="rounded border border-[var(--pp-color-border)] bg-white p-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">
                      Appeal draft
                    </p>
                    <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap">
                      {denial.appeal_letter_draft}
                    </p>
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}

          {template && activeTab.id === "form" ? (
            <Card className="space-y-4">
              <h2 className="text-base font-semibold">Questionnaire</h2>
              <DraftSafetyBanner />

              <div className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">AI-assisted draft fill</p>
                  <Button onClick={handleRunAutofill} disabled={autofilling || evidenceDocuments.length === 0}>
                    {autofilling ? "Autofilling..." : "Refresh from evidence"}
                  </Button>
                </div>
                {evidenceDocuments.length === 0 ? (
                  <p className="pp-caption mt-2 text-[var(--pp-color-muted)]">Upload evidence first to enable autofill.</p>
                ) : null}
              </div>

              <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)]">
                <aside className="rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] p-3 lg:sticky lg:top-6 lg:self-start">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">Sections</p>
                  <div className="mt-2 space-y-1">
                    {template.questionnaire.sections.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => scrollToSection(section.id)}
                        className={
                          formSectionId === section.id
                            ? "w-full rounded border border-[var(--pp-color-ring)] bg-white px-2 py-1.5 text-left text-xs font-semibold text-[var(--pp-color-text)]"
                            : "w-full rounded border border-[var(--pp-color-border)] bg-white/50 px-2 py-1.5 text-left text-xs text-[var(--pp-color-muted)]"
                        }
                      >
                        {section.title}
                      </button>
                    ))}
                  </div>
                </aside>

                <div className="space-y-4">
                  {template.questionnaire.sections.map((section) => {
                    const completeness = section.items.filter((item) => {
                      const answer = answers[item.fieldId];
                      return answer && answer.state !== "missing" && !!answer.value?.trim();
                    }).length;
                    return (
                      <section
                        id={`section-${section.id}`}
                        key={section.id}
                        className="space-y-3 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] p-3 lg:scroll-mt-5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold">{section.title}</h3>
                            <p className="text-xs text-[var(--pp-color-muted)]">
                              {section.description} · {completeness}/{section.items.length} fields completed
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {section.items.map((item) => {
                            const answer =
                              answers[item.fieldId] ?? ({ value: null, state: "missing", note: null } as QuestionnaireAnswer);
                            const fill = autofillByFieldId.get(item.fieldId) ?? null;
                            const statusView = getFieldValidationState(answer, fill);

                            return (
                              <div key={item.fieldId} className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-medium">
                                    {item.label} {item.required ? "*" : ""}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${statusView.badge}`}>
                                    {statusView.icon} {statusView.label}
                                  </span>
                                </div>

                                {renderFieldInput(item, answer)}
                                <p className={`text-xs ${statusView.helperClass}`}>{statusView.helper}</p>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <label className="block space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">
                                    <span>Field state</span>
                                    <select
                                      value={answer.state}
                                      onChange={(event) =>
                                        updateAnswer(item.fieldId, { state: event.target.value as FieldState })
                                      }
                                      className="h-10 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3 text-sm normal-case tracking-normal text-[var(--pp-color-text)]"
                                    >
                                      <option value="missing">Missing</option>
                                      <option value="filled">Needs review</option>
                                      <option value="verified">Verified</option>
                                    </select>
                                  </label>

                                  <label className="block space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">
                                    <span>Field note</span>
                                    <input
                                      value={answer.note ?? ""}
                                      onChange={(event) => updateAnswer(item.fieldId, { note: event.target.value || null })}
                                      placeholder="Optional review notes"
                                      className="h-10 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3 text-sm normal-case tracking-normal text-[var(--pp-color-text)]"
                                    />
                                  </label>
                                </div>

                                {fill && fill.status !== "missing" && fill.citations.length > 0 ? (
                                  <Button
                                    variant="ghost"
                                    className="h-9 px-3 text-xs"
                                    onClick={() => setOpenCitationFieldId(item.fieldId)}
                                  >
                                    Why this field?
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button onClick={handleSaveAnswers} disabled={saving}>
                  {saving ? "Saving..." : "Save answers"}
                </Button>
                <Button variant="ghost" onClick={() => void refreshQuestionnaire()}>
                  Reload
                </Button>
              </div>
            </Card>
          ) : null}

          {template && activeTab.id === "review" ? (
            <Card className="space-y-4">
              <h2 className="text-base font-semibold">Review and Attest</h2>
              <DraftSafetyBanner />

              {questionnaire && questionnaire.missing_required_field_ids.length > 0 ? (
                <div className="rounded-[var(--pp-radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Missing required fields ({questionnaire.missing_required_field_ids.length}):{" "}
                  {questionnaire.missing_required_field_ids.join(", ")}
                </div>
              ) : (
                <p className="text-sm text-emerald-700">All required fields are complete.</p>
              )}

              {questionnaire?.attested_at ? (
                <p className="text-sm text-emerald-700">
                  Attested by {questionnaire.attested_by_email ?? "clinician"} on{" "}
                  {new Date(questionnaire.attested_at).toLocaleString()}.
                </p>
              ) : null}

              {user?.role === "clinician" && !questionnaire?.attested_at ? (
                <div className="space-y-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={attestChecked}
                      onChange={(event) => setAttestChecked(event.target.checked)}
                      className="mt-1"
                    />
                    <span>I reviewed the questionnaire and approve this packet for export.</span>
                  </label>
                  <Button
                    onClick={handleAttest}
                    disabled={
                      !attestChecked || attesting || (questionnaire?.missing_required_field_ids.length ?? 1) > 0
                    }
                  >
                    {attesting ? "Attesting..." : "Attest as clinician"}
                  </Button>
                </div>
              ) : null}

              {user?.role !== "clinician" && !questionnaire?.attested_at ? (
                <p className="text-sm text-[var(--pp-color-muted)]">
                  A clinician account must complete attestation before export is enabled.
                </p>
              ) : null}
            </Card>
          ) : null}

          {template && activeTab.id === "export" ? (
            <Card className="space-y-3">
              <h2 className="text-base font-semibold">Export</h2>
              <p className="text-sm text-[var(--pp-color-muted)]">
                Generate deterministic packet artifacts: PDF, packet JSON, and metrics.json.
              </p>

              <div className="rounded-[var(--pp-radius-md)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Model output is a draft; verify before submission.
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void handleGenerateExport("initial")}
                  disabled={!questionnaire?.export_enabled || exportingType !== null}
                >
                  {exportingType === "initial" ? "Generating packet..." : "Generate packet export"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleGenerateExport("appeal")}
                  disabled={!questionnaire?.export_enabled || !denial || exportingType !== null}
                >
                  {exportingType === "appeal" ? "Generating appeal..." : "Generate appeal packet"}
                </Button>
              </div>

              {!questionnaire?.export_enabled ? (
                <p className="text-xs text-amber-700">Clinician attestation is required before export.</p>
              ) : null}
              {questionnaire?.export_enabled && !denial ? (
                <p className="text-xs text-[var(--pp-color-muted)]">
                  Appeal export unlocks after uploading a denial letter in Evidence.
                </p>
              ) : null}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Generated exports</h3>
                {exports.length === 0 ? (
                  <p className="text-sm text-[var(--pp-color-muted)]">No exports generated yet.</p>
                ) : (
                  exports.map((item) => (
                    <div
                      key={item.export_id}
                      className="space-y-2 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-[var(--pp-color-surface)] p-3"
                    >
                      <p className="text-sm font-semibold">
                        #{item.export_id} · {item.export_type === "appeal" ? "Appeal packet" : "Initial packet"}
                      </p>
                      <p className="text-xs text-[var(--pp-color-muted)]">
                        {new Date(item.created_at).toLocaleString()} · Completeness:{" "}
                        {String(item.metrics_json?.completeness_score ?? "N/A")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void fetchExportDetail(item.export_id)
                              .then((detail) =>
                                downloadBase64(
                                  `case-${item.case_id}-${item.export_type}-${item.export_id}.pdf`,
                                  detail.pdf_base64,
                                  "application/pdf",
                                ),
                              )
                              .catch((downloadError) =>
                                setError(
                                  downloadError instanceof Error
                                    ? downloadError.message
                                    : "Failed to download PDF",
                                ),
                              )
                          }
                        >
                          Download PDF
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void fetchExportDetail(item.export_id)
                              .then((detail) =>
                                downloadText(
                                  `case-${item.case_id}-${item.export_type}-${item.export_id}.packet.json`,
                                  JSON.stringify(detail.packet_json, null, 2),
                                  "application/json",
                                ),
                              )
                              .catch((downloadError) =>
                                setError(
                                  downloadError instanceof Error
                                    ? downloadError.message
                                    : "Failed to download packet JSON",
                                ),
                              )
                          }
                        >
                          Download packet.json
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            downloadText(
                              `case-${item.case_id}-${item.export_type}-${item.export_id}.metrics.json`,
                              JSON.stringify(item.metrics_json, null, 2),
                              "application/json",
                            )
                          }
                        >
                          Download metrics.json
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          ) : null}
        </motion.div>
      </AnimatePresence>

      {
        toast ? (
          <p role="status" className="rounded-[var(--pp-radius-md)] bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
            {toast}
          </p>
        ) : null
      }

      <CitationDrawer
        open={openCitationFieldId !== null}
        fieldLabel={openFieldLabel}
        fill={openFill}
        onClose={() => setOpenCitationFieldId(null)}
        onOpenDocument={(docId) => {
          setSelectedTab("evidence");
          setSelectedDocId(docId);
          setOpenCitationFieldId(null);
        }}
      />

      <p className="text-xs text-[var(--pp-color-muted)]">Active tab: {activeTab.label}</p>
      </WorkspaceFrame>
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
