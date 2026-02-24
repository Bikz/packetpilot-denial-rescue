"use client";

import type { FhirPatientSnapshot } from "@packetpilot/fhir";
import {
  getServiceLineTemplate,
  getTemplateFieldIds,
  type QuestionnaireItem,
  type ServiceLineTemplate,
} from "@packetpilot/templates";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Card, StepShell } from "@packetpilot/ui";

import {
  CitationDrawer,
  type AutofillFieldFill,
  type Citation,
} from "@/components/citation-drawer";
import { AuthGuard } from "@/components/auth-guard";
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
  text_preview: string;
  snippets: Citation[];
  created_at: string;
};

type CaseDocumentDetail = {
  id: number;
  case_id: number;
  filename: string;
  content_type: string;
  extracted_text: string;
  snippets: Citation[];
  created_at: string;
};

type AutofillRun = {
  case_id: number;
  fills: AutofillFieldFill[];
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

  const [attestChecked, setAttestChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
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

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      try {
        const currentCase = await apiRequest<CaseRecord>(`/cases/${caseId}`, { auth: true });
        if (!active) return;
        setCaseRecord(currentCase);

        const [patientSnapshot, caseQuestionnaire, caseDocuments, caseAutofill] = await Promise.all([
          apiRequest<FhirPatientSnapshot>(`/fhir/patients/${currentCase.patient_id}/snapshot`, {
            auth: true,
          }),
          apiRequest<CaseQuestionnaire>(`/cases/${caseId}/questionnaire`, { auth: true }),
          apiRequest<CaseDocumentListItem[]>(`/cases/${caseId}/documents`, { auth: true }),
          apiRequest<AutofillRun>(`/cases/${caseId}/autofill`, { auth: true }),
        ]);

        if (!active) return;

        setSnapshot(patientSnapshot);
        setQuestionnaire(caseQuestionnaire);
        setDocuments(caseDocuments);
        setAutofill(caseAutofill);

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

  function fieldStatusColor(fieldId: string, answer: QuestionnaireAnswer): {
    badge: string;
    label: string;
  } {
    const fill = autofillByFieldId.get(fieldId);
    if (fill?.status === "autofilled") {
      return { badge: "bg-emerald-100 text-emerald-700", label: "Autofilled" };
    }
    if (fill?.status === "suggested") {
      return { badge: "bg-amber-100 text-amber-700", label: "Suggested" };
    }

    if (answer.state === "verified") {
      return { badge: "bg-emerald-100 text-emerald-700", label: "Verified" };
    }
    if (answer.state === "filled") {
      return { badge: "bg-amber-100 text-amber-700", label: "Filled" };
    }
    return { badge: "bg-rose-100 text-rose-700", label: "Missing" };
  }

  const activeTab = TABS.find((tab) => tab.id === selectedTab) ?? TABS[0];
  const openFill = openCitationFieldId ? autofillByFieldId.get(openCitationFieldId) ?? null : null;
  const openFieldLabel = openCitationFieldId
    ? (itemByFieldId.get(openCitationFieldId)?.label ?? openCitationFieldId)
    : "";

  return (
    <StepShell
      eyebrow="Case Workspace"
      title={`Case #${Number.isNaN(caseId) ? "-" : caseId}`}
      description="Complete requirements, ingest evidence, and verify model-assisted field fills."
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
          <p className="text-sm text-[var(--pp-color-muted)]">Template: {caseRecord.service_line_template_id}</p>
          <p className="text-sm text-[var(--pp-color-muted)]">Status: {caseRecord.status}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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

      {!template ? (
        <Card>
          <p className="text-sm text-red-600">
            Template not supported in this build: {caseRecord?.service_line_template_id}
          </p>
        </Card>
      ) : null}

      {template && activeTab.id === "requirements" ? (
        <Card className="space-y-4">
          <h2 className="text-base font-semibold">Requirements Checklist</h2>
          <div className="space-y-2">
            {template.requiredFieldIds.map((fieldId) => {
              const item = itemByFieldId.get(fieldId);
              const answer = answers[fieldId];
              const complete = !!answer && answer.state !== "missing" && !!answer.value?.trim();
              return (
                <div
                  key={fieldId}
                  className="flex items-center justify-between rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] px-3 py-2"
                >
                  <p className="text-sm font-medium">{item?.label ?? fieldId}</p>
                  <span
                    className={
                      complete
                        ? "text-xs font-semibold text-emerald-700"
                        : "text-xs font-semibold text-amber-700"
                    }
                  >
                    {complete ? "Complete" : "Missing"}
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
        </Card>
      ) : null}

      {template && activeTab.id === "form" ? (
        <Card className="space-y-4">
          <h2 className="text-base font-semibold">Questionnaire</h2>

          <div className="rounded-[var(--pp-radius-md)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Model output is a draft; verify before submission.
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleRunAutofill} disabled={autofilling || documents.length === 0}>
              {autofilling ? "Autofilling..." : "Autofill from evidence"}
            </Button>
            {documents.length === 0 ? (
              <p className="text-xs text-[var(--pp-color-muted)]">Upload a document in Evidence first.</p>
            ) : null}
          </div>

          {template.questionnaire.sections.map((section) => (
            <div key={section.id} className="space-y-3 rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] p-3">
              <div>
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <p className="text-xs text-[var(--pp-color-muted)]">{section.description}</p>
              </div>

              <div className="space-y-3">
                {section.items.map((item) => {
                  const answer =
                    answers[item.fieldId] ?? ({ value: null, state: "missing", note: null } as QuestionnaireAnswer);
                  const fill = autofillByFieldId.get(item.fieldId) ?? null;
                  const statusView = fieldStatusColor(item.fieldId, answer);

                  return (
                    <div key={item.fieldId} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${statusView.badge}`}>
                          {statusView.label}
                        </span>
                        {fill && fill.status !== "missing" && fill.citations.length > 0 ? (
                          <Button variant="ghost" onClick={() => setOpenCitationFieldId(item.fieldId)}>
                            Why?
                          </Button>
                        ) : null}
                      </div>

                      <label className="block space-y-1 text-sm font-medium">
                        <span>
                          {item.label} {item.required ? "*" : ""}
                        </span>
                        {renderFieldInput(item, answer)}
                      </label>

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
                            <option value="filled">Filled</option>
                            <option value="verified">Verified</option>
                          </select>
                        </label>

                        <label className="block space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pp-color-muted)]">
                          <span>Field note</span>
                          <input
                            value={answer.note ?? ""}
                            onChange={(event) => updateAnswer(item.fieldId, { note: event.target.value || null })}
                            placeholder="Optional context"
                            className="h-10 w-full rounded-[var(--pp-radius-md)] border border-[var(--pp-color-border)] bg-white px-3 text-sm normal-case tracking-normal text-[var(--pp-color-text)]"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

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

          <div className="rounded-[var(--pp-radius-md)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Model output is a draft; verify before submission.
          </div>

          {questionnaire && questionnaire.missing_required_field_ids.length > 0 ? (
            <div className="rounded-[var(--pp-radius-md)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Missing required fields: {questionnaire.missing_required_field_ids.join(", ")}
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
            Export remains locked until clinician attestation is completed.
          </p>
          <Button disabled={!questionnaire?.export_enabled}>Export packet</Button>
          {!questionnaire?.export_enabled ? (
            <p className="text-xs text-amber-700">Clinician attestation is required before export.</p>
          ) : (
            <p className="text-xs text-emerald-700">Ready for export in Epic 6.</p>
          )}
        </Card>
      ) : null}

      {toast ? (
        <p role="status" className="rounded-[var(--pp-radius-md)] bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </p>
      ) : null}

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
