PacketPilot Product Specification for a Prior Authorization Copilot
Product vision and scope
PacketPilot is a local-first, installable web app (PWA) designed for clinic staff (prior-auth coordinators, MAs, nurses) to produce first-time-right prior authorization submissions by assembling a payer-aligned form + evidence binder with field-level citations back to source chart data and documents. It is purpose-built to fit the MedGemma Impact Challenge’s emphasis on “run anywhere,” privacy, and human-centered workflows, while staying within HAI-DEF restrictions by never auto-deciding coverage approvals/denials and requiring explicit human review at each submission step. (
)

This spec is intentionally scoped to two end-to-end user journeys for a hackathon-quality “production-shaped” demo:

Journey A: New PA request for a single service line (choose 1):
Imaging example: “MRI Lumbar Spine” (common + documentation-heavy), or
Medication example: “GLP-1” or “PCSK9 inhibitor” (typical ePA patterns).
Journey B: Denial → Fix-forward → Appeal/Resubmit for the same service line.
Everything else is treated as roadmap.

Why this is a strong wedge: the U.S. CMS Interoperability and Prior Authorization final rule explicitly pushes the industry toward standardized, API-driven prior authorization workflows built on HL7 FHIR and related Implementation Guides, with operational provisions generally beginning in 2026 and API requirements generally beginning in 2027 (varying by payer type). (
) PacketPilot’s architecture and artifacts are designed to look “day-1 deployable” in that direction (even though real payer integrations are a later phase).

Hackathon deliverables that this spec supports:

A polished UI demo video (≤3 minutes). (
)
A concise write-up (≤3 pages) and reproducible code. (
)
Target users, user journeys, and information architecture
Primary users
Prior Authorization Coordinator (primary): builds and submits packets; handles denials.
Ordering Clinician (secondary): reviews clinical rationale + signs off.
Clinic Admin/IT (setup): installs PacketPilot; configures EHR connectivity and templates.
Installation model and form factor decision
Decision: Web app + PWA (installable), optionally SMART-on-FHIR embedded launch.

Rationale:

Clinics live on desktop browsers inside EHR workflows, but a PWA install creates an app-like feel (dock icon, full-screen, fast) while remaining easy to deploy and update.
SMART App Launch provides a standards-based path to integrate as an embedded EHR app with single sign-on and patient context. (
)
A “local-first” mode reduces PHI transmission risk and minimizes cloud compliance complexity, consistent with HIPAA guidance emphasizing responsibilities when creating/receiving/transmitting ePHI in cloud services (and the need for BAAs when using cloud service providers for ePHI). (
)
Core IA (top-level navigation)
Keep IA minimal—four primary tabs plus Settings:

Queue
Case Workspace
Templates
Exports
Settings (hidden behind profile icon)
Suggested routing:

/onboarding/* (first-run wizard)
/queue
/case/:caseId (single workspace)
/templates (service line templates + payer questionnaires)
/exports (download past packets, audit logs)
/settings (integrations, security, model, environment)
Objects and terminology (product vocabulary)
Case: one prior authorization request instance (patient + requested service + payer + status).
Template: service line definition (what you’re requesting, what evidence is needed, rules).
Questionnaire: a DTR-style requirement form (rendered UI) with machine-fillable fields.
Evidence Binder: citations + attachments assembled to support submission.
Packet: exportable bundle (PDF + machine-readable JSON + audit log).
This vocabulary intentionally mirrors the direction of standard “documentation templates and rules” and prior authorization submission support. (
)

UX design spec for the two main journeys
UX principles
Mobile onboarding feel: single-column, card-based screens; one primary action per page.
Desktop operational speed: keyboard-first, “review panes” to limit context switching.
Evidence-first trust: every autofilled field has a “Why?” link to show source snippets.
Human-in-the-loop by design: explicit “Review & attest” step before exports/submission.
Fail-soft: if model/data missing, workflow continues with manual fill.
Also, the UX must avoid prohibited “automated decisions” in healthcare/insurance contexts. PacketPilot should present suggestions and drafts only, with user attestation and final control. (
)

Onboarding flow
Goal: enable a clinic to stand up the app in <10 minutes.

Screens (PWA-style):

Welcome
“Run locally” vs “Connect to EHR”
Deployment mode
Option A: Standalone (manual upload / FHIR bundle import)
Option B: SMART-on-FHIR (EHR contextual launch)
FHIR server setup
Inputs: FHIR base URL, auth type (none for demo / OAuth for SMART), scopes
Model setup
Local model on this machine (GPU recommended) vs “remote inside clinic VPC”
Show HIPAA reminder: using cloud for ePHI requires appropriate agreements/safeguards. (
)
Select service line template
Pick One: Imaging MRI Lumbar Spine (recommended) or Medication ePA
Done
“Go to Queue”
Journey A: New PA request (end-to-end)
Entry points:

Standalone: “New Case” button in Queue
SMART launch: coming from EHR patient context (auto-creates draft case)
Steps:

Create Case

Inputs (minimal):
Patient (FHIR selection or manual)
Payer name + plan type (lightweight)
Requested service (template selection)
Ordering provider
Output: Case created → routes to /case/:id
Requirements Checklist (1-screen summary)

A “Requirements” card showing:
The questionnaire sections
Required attachments (e.g., recent note, imaging, PT trial evidence, etc.)
This mirrors the “documentation requirements discovery” function that standards are moving toward (even if you simulate it in hackathon). (
)
Evidence Ingestion

Upload or connect:
clinical note PDF/text
relevant labs/imaging reports
optional denial history (none for new)
UI: drag-drop + “auto-detect key evidence” button
Autofill Questionnaire

Questionnaire rendered as form sections.
Each field can be:
autofilled (green) with citation
suggested (yellow) needing confirmation
missing (red) with “how to obtain” hint
Salesforce-style “field drawer”:
field value
confidence
citation(s)
“edit / mark unknown / add note”
Clinical Rationale Draft

A short payer-facing narrative (“medical necessity”) produced as a draft.
Must include “evidence bullets” with citations.
Review + Attest

Ordering clinician reviews:
key fields
narrative
attachments
Attestation checkbox: “I reviewed and approve this packet.”
This is a key safety/compliance UX element aligned to human oversight. (
)
Export Packet

Generates:
PDF packet (human-readable)
JSON packet (machine-readable “submission bundle”)
audit log (who/what/when)
For hackathon, “Submit to payer” is simulated as:
Save export + show “submission status: Ready”
Standards realism note: NCPDP’s ePA standards describe question sets, “more information required” cycles, and the use of attachments and appeal transactions—PacketPilot’s fields and exports should be shaped to look compatible with these patterns even in a simulated demo. (
)

Journey B: Denial → Fix-forward → Appeal/Resubmit
Steps:

Denial intake

Upload denial letter PDF or paste text.
Extract:
denial reason category
missing documentation list
any deadlines / reference IDs (if present)
Gap Report

UI: “Missing items” checklist with:
where to find in chart
what to upload
what questionnaire fields will be updated
Auto-update packet

Once missing evidence is ingested, questionnaire is re-filled and narrative updated.
Appeal letter draft

Generates a draft letter with:
structured headings
cited evidence bullets
respectful tone
Exported alongside resubmission packet.
Again: this must be framed as a drafting/copilot workflow; no automated “approval probability” or instructions that constitute the practice of medicine.

Production-leaning tech stack, security posture, and system architecture
Deployment targets
PacketPilot should support two “clinic-ready” deployment patterns:

Local workstation / small clinic server (recommended for hackathon)

Single machine with GPU (preferred) for model inference.
All data stored locally.
Install via Docker Compose.
Clinic VPC / on-prem Kubernetes

Model inference service runs inside clinic-controlled network.
Frontend served internally.
PHI never leaves the clinic’s boundary.
If cloud is used to store/process ePHI, HIPAA guidance indicates the need for appropriate protections such as BAAs and compliance with HIPAA rules; this is why “local-first” is the default posture. (
)

High-level architecture
Frontend (PWA)

Next.js (React + TypeScript)
PWA install + offline shell caching (service worker)
Component library (shadcn/ui or MUI) with strict a11y
Backend API

Python FastAPI (typed endpoints, OpenAPI)
Background jobs (Celery or Dramatiq) for long-running packet builds
Storage:
PostgreSQL (prod), SQLite (hackathon mode)
S3-compatible object store (prod) or filesystem (hackathon)
FHIR Integration

SMART-on-FHIR contextual launch supported; SMART spec defines secure EHR integration and app launch mechanisms, including state persistence capabilities. (
)
FHIR R4 client:
fetch: Patient, Coverage (payer), Condition, Observation, MedicationRequest, ServiceRequest, DocumentReference
Requirements & Templates Engine

Template format inspired by Da Vinci DTR “documentation templates and rules” (questionnaires + rules), and PAS for submission shaping. (
)
Model Service

MedGemma 1.5 4B (multimodal) for:
document understanding: converting unstructured lab reports (PDF/images) into structured JSON
EHR-text understanding for field extraction
This capability expansion is explicitly described in official MedGemma/HAI-DEF documentation and the model card’s evaluation description. (
)
Audit & Safety Layer

Immutable event log:
field auto-filled, edited, approved
export generated
“Human attestation required” gating before export.
Model integration design (extraction with grounding)
Core design goal: make the model’s contribution auditable, not magical.

Data flow for extraction:

Retrieve candidate sources:
FHIR resources + document text (from PDF/OCR).
Normalize into “Evidence Units”:
{source_id, source_type, text_span, page, offsets}
Run “Field Fill” prompts per section:
Output must conform to JSON schema:
field_id
value
confidence
citations: [EvidenceUnitRef]
UI shows fill + citations.
MedGemma 1.5 is specifically positioned for document understanding and EHR interpretation, which makes it well-suited as the core extractor in a local-first pipeline like this. (
)

Privacy and policy compliance guardrails
PacketPilot must not “approve/deny” or automate insurance decisions; it drafts content and supports human review. (
)
PHI scope: HIPAA Privacy Rule protects “individually identifiable health information” held or transmitted by covered entities/business associates in any form; therefore PacketPilot must treat all retrieved chart data as PHI by default. (
)
If any cloud components are introduced, follow HIPAA cloud computing guidance and require BAAs where applicable. (
)
Modular repo and file structure
Use a monorepo so each epic stays buildable and composable.

Recommended structure (Turborepo + pnpm):

apps/
web/ — Next.js PWA UI
api/ — FastAPI service (REST + background jobs)
worker/ — job runner (optional; can live in api/ for hackathon)
packages/
ui/ — shared components, design tokens
types/ — shared TypeScript types + OpenAPI client
schemas/ — JSON schemas for questionnaires, packets, audit logs
fhir/ — FHIR client wrappers + mappers
templates/ — service line templates + simulated payer questionnaires
eval/ — evaluation harness + synthetic scenario generator
infra/
docker/ — Dockerfiles, compose
scripts/ — one-command setup (seed data, start stack)
docs/
architecture, threat model, demo storyboard, writeup draft
Quality gates:

Frontend: ESLint + TypeScript strict + Playwright smoke tests
Backend: ruff/black + mypy (optional) + pytest
Contract: OpenAPI schema checked in; generated TS client pinned
