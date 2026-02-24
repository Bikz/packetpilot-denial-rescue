# Repository Quality Settings

Last updated: 2026-02-24

This document captures repository settings that should be enforced in GitHub for quality and safety.
If a setting cannot be enforced from code, it must be tracked here.

## Branch Protection (target: `main`)

Required settings:

1. Require pull request before merging.
2. Require at least 1 approval.
3. Dismiss stale approvals when new commits are pushed.
4. Require status checks to pass before merging.
5. Required check: `CI / verify` (from `.github/workflows/ci.yml`).
6. Require conversation resolution before merging.
7. Prevent force pushes.
8. Prevent branch deletion.

Current status (manual check required): **Not programmatically enforced from this repo**.

## CODEOWNERS

Target: add `.github/CODEOWNERS` and enforce code-owner review for protected branches.

Suggested baseline:

```txt
* @packetpilot/core
/apps/web/ @packetpilot/web
/apps/api/ @packetpilot/api
/packages/ @packetpilot/platform
/.github/workflows/ @packetpilot/platform
```

Current status: **`CODEOWNERS` file not present**.

## Merge Strategy

Recommended:

1. Squash merge enabled.
2. Rebase merge optional.
3. Merge commits disabled.

Current status (manual check required): **Unknown**.

## Secrets and Environments

Recommended:

1. Use environment-scoped secrets for prod/staging.
2. Require reviewers for production environment deployments.
3. Disable plaintext long-lived secrets in workflow files.

Current status (manual check required): **Unknown**.

