# PacketPilot Production Deploy + MedGemma Proof

This checklist is optimized for hackathon speed:

- Web (`apps/web`) on Vercel
- API (`apps/api`) on Render

## 1. Deploy API on Render

Create a Render web service pointing to `apps/api` with:

- Build command: `cd apps/api && uv sync`
- Start command: `cd apps/api && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Required environment variables:

```bash
APP_SECRET=<long-random-secret>
DATABASE_URL=sqlite:///./data/packetpilot.db
ALLOWED_ORIGINS=https://<your-vercel-domain>

MODEL_MODE=medgemma
MODEL_ID=google/medgemma-1.5-4b-it
MODEL_DEVICE=cpu
MODEL_STRICT=1
HUGGING_FACE_HUB_TOKEN=hf_xxx
```

Notes:
- Keep `MODEL_DEVICE=cpu` in production unless you have validated GPU runtime.
- `MODEL_STRICT=1` ensures autofill fails loudly rather than silently falling back to mock extraction.

## 2. Deploy Web on Vercel

Set web environment variable:

```bash
NEXT_PUBLIC_API_BASE_URL=https://<your-render-api-domain>
```

Deploy `apps/web` to Vercel (project root can remain monorepo; set app root to `apps/web` in project settings if needed).

## 3. Verify bonus criteria in production

### A) Public interactive demo app

- Open your public Vercel URL.
- Complete login + queue + create case + case workspace navigation.

### B) Open-weight HF model tracing to HAI-DEF model

Run:

```bash
curl https://<your-render-api-domain>/model/status
```

Expected fields:

- `"backend": "medgemma"`
- `"strict_mode": true`
- `"model_id": "google/medgemma-1.5-4b-it"`

Then verify real inference path:

1. Upload evidence document in a case.
2. Click `Autofill`.
3. Confirm fields are filled with citations and no model-unavailable error.

## 4. Writeup evidence to include

- Public demo URL (Vercel).
- Public repo URL.
- HF model link: `https://huggingface.co/google/medgemma-1.5-4b-it`.
- Screenshot or JSON snippet of `/model/status`.
- Brief statement that extraction runs with `MODEL_MODE=medgemma`, `MODEL_STRICT=1`.
