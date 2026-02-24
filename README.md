# PacketPilot PriorAuth Monorepo (Epic 1)

## One-command startup

```bash
pnpm dev
```

This starts:
- web app: `http://localhost:3000/onboarding/welcome`
- api health endpoint: `http://localhost:8000/healthz`

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
