# PacketPilot PriorAuth Monorepo (Epics 1-3)

## One-command startup

```bash
pnpm dev
```

This starts:
- web app: `http://localhost:3000/onboarding/welcome`
- api health endpoint: `http://localhost:8000/healthz`
- admin bootstrap: `http://localhost:3000/onboarding/admin`
- login: `http://localhost:3000/login`
- settings: `http://localhost:3000/settings`
- queue: `http://localhost:3000/queue`
- new case wizard: `http://localhost:3000/cases/new`

## Container startup

```bash
export APP_SECRET="$(openssl rand -hex 32)"
docker compose up --build
```

This brings up:
- web (`3000`)
- api (`8000`)
- HAPI FHIR sandbox (`8080`, configurable via `FHIR_PORT`)
- automatic synthetic FHIR seed import (`fhir-seed`)

## Epic 6 demo run (under 5 minutes)

```bash
chmod +x infra/scripts/demo_epic6.sh
./infra/scripts/demo_epic6.sh
```

This script boots the stack, creates demo users/case, runs autofill, uploads a denial letter,
generates initial + appeal packet exports, and writes `packet.json`, `metrics.json`, and `packet.pdf`
under `apps/api/data/demo-artifacts/`.
If port `8080` is occupied, the script auto-selects an open FHIR host port (for example `18080`).
You can also force one explicitly:

```bash
FHIR_PORT=18080 ./infra/scripts/demo_epic6.sh
```

## Quality gates

```bash
pnpm lint
pnpm test
pnpm build
```

## Epic 2-3 flow

1. Go to `/onboarding/admin` to create the first clinic admin (fresh install).
2. Sign in at `/login`.
3. Open `/queue` and click **New case**.
4. Select a seeded patient + service line and create a case.
5. Land in `/case/:caseId` workspace with tab skeleton (Requirements, Evidence, Form, Review, Export).
6. Update clinic configuration at `/settings`.
7. Confirm audit events appear on the settings screen.

## Production deploy recommendation

Fastest path for a hackathon-grade public demo:

- `apps/web` on Vercel
- `apps/api` on Render

Set API CORS to your Vercel URL:

```bash
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

## Real MedGemma mode (HAI-DEF proof)

For real model inference (not mock), set these API env vars:

```bash
MODEL_MODE=medgemma
MODEL_ID=google/medgemma-1.5-4b-it
MODEL_DEVICE=cpu
MODEL_STRICT=1
HUGGING_FACE_HUB_TOKEN=hf_xxx
```

Notes:
- `MODEL_STRICT=1` disables silent fallback to mock extraction on malformed model output.
- On Apple Silicon local runs, you can try `MODEL_DEVICE=mps`; if unstable, use `cpu`.

Runtime verification endpoint:

```bash
curl http://localhost:8000/model/status
```

You should see:
- `"backend": "medgemma"`
- `"strict_mode": true`
- `"model_id": "google/medgemma-1.5-4b-it"`
