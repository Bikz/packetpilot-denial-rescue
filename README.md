# PacketPilot PriorAuth Monorepo (Epic 1)

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

## Container startup

```bash
docker compose up --build
```

## Quality gates

```bash
pnpm lint
pnpm test
pnpm build
```

## Epic 2 auth flow

1. Go to `/onboarding/admin` to create the first clinic admin (fresh install).
2. Sign in at `/login`.
3. Update clinic configuration at `/settings`.
4. Confirm audit events appear on the same settings screen.
