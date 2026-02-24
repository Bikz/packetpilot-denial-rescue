# Project Name

**PacketPilot PriorAuth Copilot**

# Your Team

- _Add team members and roles here._

# Problem Statement

Prior authorization is a high-friction workflow in US clinical practice: staff manually gather records, interpret payer requests, and repackage repeatable information across repeated cycles (initial request, denial, appeal). This causes delays, staff burnout, and inconsistent packet quality.

PacketPilot addresses this by turning prior-auth case creation into a constrained, human-in-the-loop workflow. Staff create a case from seeded/manual patient context, ingest clinical evidence, and receive model-assisted questionnaire completion with source citations. A clinician review gate is required before packet export.

This is a practical wedge for a clinic workflow: it does not replace payer decisions, and it keeps final control with humans while using AI to reduce repetitive extraction and documentation work.

# Overall Solution

We built a full-stack workflow demo that demonstrates MedGemma/HAI-DEF as a **field-level extraction engine** inside a prior-auth assistant.

MedGemma is used to convert unstructured textual evidence into structured questionnaire fills for a prior-auth template. In this build, the default path is a deterministic mock extractor for stability, while MedGemma can be enabled through environment configuration for HAI-DEF usage.

Core product flow:

1) Case creation with patient/payer/context and service-line template selection.
2) Evidence ingestion from text/PDF documents (image uploads are accepted but OCR is placeholder-only in this build).
3) Autofill run that maps extracted evidence to required template fields, returning values + confidence + citations.
4) Human attestation before export.
5) Export bundle creation for submission (PDF + JSON + audit trail metadata).
6) Denial intake and appeal drafting with gap report and citation-backed letter generation.

The solution is intentionally scoped and transparent about current limits:
- One production template path in the shipped UI: **MRI Lumbar Spine**.
- Denial parsing is deterministic/regex-driven (baseline baseline), not full NLP-level semantic extraction.
- SMART-on-FHIR configuration exists, but case auto-creation is still primarily manual/workbench-driven.
- OCR on images is not yet fully implemented.

# Technical Details

### Architecture

- **Frontend:** Next.js web app (monorepo workspace under `apps/web`), case workspace with tabs for requirements, evidence, autofill, review/attest, and export.
- **Backend:** FastAPI service under `apps/api` with persistent case, questionnaire, document, and audit models.
- **Templates:** Template registry supports one active template in shipped code (`MRI_LUMBAR_SPINE_TEMPLATE`); questionnaire fields drive required-field validation and autofill output shape.
- **Model layer:** `ModelService` abstraction with two runtime modes in `apps/api/app/model_service.py`:
  - `mock` for regex-based deterministic extraction.
  - `medgemma` for open-weight model-backed generation.
- **Evidence flow:** Document upload endpoint extracts text from text/PDF and persists evidence + snippets for citations.
- **FHIR:** Patient lookup/snapshot integration via `/fhir/patients` endpoints.
- **Export:** Deterministic artifact generation in API export service and package output includes structured results and trace metadata.

### Model usage and MedGemma path

- Model selection and runtime behavior are controlled by env:
  - `MODEL_MODE=medgemma|mock`
  - `MODEL_ID=google/medgemma-1.5-4b-it`
  - `MODEL_DEVICE=cpu|mps`
  - `MODEL_STRICT=1` to disable silent fallback.
- In non-strict mode, malformed MedGemma outputs fall back to deterministic extraction so the workflow remains resilient.
- This is documented explicitly so judges can evaluate both demo-safe and model-driven behavior.

### Reproducibility for judges

- Start environment: `pnpm dev` (repo root).
- Run Epic 6 demo: `chmod +x infra/scripts/demo_epic6.sh && ./infra/scripts/demo_epic6.sh`.
- Verify model mode status endpoint: `GET /model/status` on API.
- Expected demo outputs include `apps/api/data/demo-artifacts/packet.json`, `metrics.json`, and `packet.pdf`.

### Feasibility and deployment proof

The stack is deployed-ready for demo:
- Web frontend on Vercel.
- API on Render.
- Healthcheck and model-status endpoints for production verification.
- Public demo URL and code are provided in submission links.

### Limitations and explicit scope

- OCR for image uploads is placeholder (`[OCR fallback not yet enabled ...]` in current document parser).
- Template coverage is currently MRI-only in shipped UI/template registry.
- SMART launch automation is not fully end-to-end in this version.
- Denial parsing uses deterministic pattern matching with keyword-based gap inference.
- “Audit log” is implemented as an append-only DB event trail; immutability mechanisms (hash-chain/signature) are a planned hardening step.

### Impact Potential (estimated)

- Human-time reduction: model-assisted prefill is expected to reduce repetitive typing and re-open/review of obvious fields between request + denial cycles.
- Error reduction: field-level citations and required-field visibility are intended to reduce missing-document gaps before export.
- Safety/compliance: explicit clinician attestation gate preserves human control and traceability.
- We report these as current workflow-level effects from a production-shaped demo; we do not claim real-world claims reductions beyond measured pilot use yet.

# Video Script / Demo Notes (3 min)

Suggested 3-minute structure:

1. 20s: Problem framing and existing pain point.
2. 40s: Create/open case + attach evidence.
3. 45s: Run autofill, review citations, clinician attestation gate.
4. 35s: Export bundle + denial upload → gap report → appeal draft.
5. 30s: Model-mode verification (`/model/status`) + deployment proof.
6. 20s: Honest limitations and next steps.

# Suggested Tracks

- Main track (required)
- Optional Agentic Workflow Prize (recommended): strongest argument is end-to-end call chaining through document ingest → extraction → structured drafting → human attestation.

## Submission checklist

- Keep writeup under 3 pages (concise, high-signal).
- Include source links:
  - Public repository
  - Public demo URL
  - Video URL
  - Optional `/model/status` screenshot or snippet
- Use explicit "Current capabilities vs future work" language to align with judging criteria.
