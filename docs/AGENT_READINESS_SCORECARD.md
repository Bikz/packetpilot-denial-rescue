# Agent Readiness Scorecard

Last assessed: 2026-02-24
Default target: **Level 3 (Standardized)**  
Stretch target: **Level 4 (Optimized)**  
Level 5 is aspirational.

## Scoring Rules

1. Each criterion is binary: Pass/Fail.
2. Criteria are evaluated repo-wide and per-app (`apps/web`, `apps/api`).
3. To unlock a level, scope must pass **>=80%** of criteria at that level **and** all previous levels.

## Level Summary

| Scope | L1 | L2 | L3 | L4 | L5 | Unlocked Level |
|---|---:|---:|---:|---:|---:|---|
| Repo-wide | 4/4 (100%) | 2/4 (50%) | 2/4 (50%) | 2/4 (50%) | 1/3 (33%) | **Level 1** |
| `apps/web` | 3/4 (75%) | 2/4 (50%) | 1/4 (25%) | 2/4 (50%) | 1/3 (33%) | **Not unlocked (below Level 1 threshold)** |
| `apps/api` | 2/4 (50%) | 2/4 (50%) | 2/4 (50%) | 2/4 (50%) | 1/3 (33%) | **Not unlocked (below Level 1 threshold)** |

## Detailed Criteria

### Level 1 (Functional)

| Criterion | Repo | Web | API | Evidence |
|---|---|---|---|---|
| README exists | Pass | Pass | Fail | `README.md`, `apps/web/README.md`, no `apps/api/README.md` |
| Linter configured | Pass | Pass | Pass | `apps/web/eslint.config.mjs`, `apps/api/pyproject.toml`, `apps/api/package.json` |
| Type checker active (if language supports) | Pass | Pass | Fail | `pnpm typecheck`, `apps/web/package.json` (`tsc --noEmit`), API lacks mypy/pyright |
| Unit tests present and runnable | Pass | Fail | Pass | `apps/api/tests/*`, no web unit test suite (Playwright only) |

### Level 2 (Documented)

| Criterion | Repo | Web | API | Evidence |
|---|---|---|---|---|
| AGENTS.md exists and is accurate | Fail | Fail | Fail | `AGENTS.md` not found in repo |
| Reproducible dev env documented | Pass | Pass | Pass | `README.md` startup steps and endpoints |
| Pre-commit hooks (or equivalent) exist | Fail | Fail | Fail | no `.pre-commit-config.yaml`, no `.husky/` |
| Repo settings required for quality documented | Pass | Pass | Pass | `docs/REPO_SETTINGS.md` |

### Level 3 (Standardized)

| Criterion | Repo | Web | API | Evidence |
|---|---|---|---|---|
| E2E tests exist for North Star journeys | Pass | Pass | Pass | `apps/web/tests/packet-export-denial.spec.ts`, API integration-style tests (`apps/api/tests/test_export_denial.py`) |
| Docs maintained (not stale) | Fail | Fail | Fail | `apps/web/README.md` remains default template and stale to current app behavior |
| Security scanning exists (dependency audit, secret scan, etc.) | Fail | Fail | Fail | no audit/secret scan job in `.github/workflows/ci.yml` |
| Observability basics exist (where applicable) | Pass | Fail | Pass | API has `/healthz` and audit events; web lacks explicit telemetry/health surface |

### Level 4 (Optimized)

| Criterion | Repo | Web | API | Evidence |
|---|---|---|---|---|
| Sub-minute validation path exists | Pass | Pass | Pass | turbo cache enables fast repeat checks (`pnpm lint`, `pnpm typecheck`) |
| Observability meaningful for prod | Fail | Fail | Fail | no metrics dashboards/alerts/tracing/SLOs documented |
| Canary/rollout strategy exists | Fail | Fail | Fail | no rollout strategy docs/workflow |
| Build optimization improvements applied | Pass | Pass | Pass | Turborepo caching (`turbo.json`), Docker layer optimization |

### Level 5 (Autonomous) — Aspirational

| Criterion | Repo | Web | API | Evidence |
|---|---|---|---|---|
| Task decomposition/orchestration robust | Fail | Fail | Fail | no in-repo orchestration framework/runbook |
| Multi-service orchestration support | Pass | Pass | Pass | `docker-compose.yml` with `web`, `api`, `fhir`, `fhir-seed` |
| Self-healing / auto-remediation documented or partial | Fail | Fail | Fail | no auto-remediation hooks documented |

## Gap to Target Level 3

To unlock Level 3, repo-wide must first unlock Level 2.

Highest-priority changes:

1. Add and maintain `AGENTS.md` in repo root.
2. Add pre-commit hooks (for example, `pre-commit` or Husky + lint/test guards).
3. Replace stale app docs (especially `apps/web/README.md`) and add `apps/api/README.md`.
4. Add security scanning to CI (dependency audit + secret scanning).
5. Add basic web observability surface (client error capture/logging path).

