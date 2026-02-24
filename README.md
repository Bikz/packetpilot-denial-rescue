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
docker compose up --build
```

This brings up:
- web (`3000`)
- api (`8000`)
- HAPI FHIR sandbox (`8080`)
- automatic synthetic FHIR seed import (`fhir-seed`)

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
