# Repository Guardrails

This document defines Milestone A (version control safety) and Milestone B (end-to-end validation) rollout for this repository.

## Milestone A - Version Control Safety

### 1) Branch Protection (GitHub Settings)

Apply branch protection rule to `main` (and optionally `develop`) with these settings:

- Require a pull request before merging.
- Require at least 1 approval.
- Require review from Code Owners.
- Dismiss stale pull request approvals when new commits are pushed.
- Require status checks to pass before merging.
- Do not allow bypassing required pull requests.
- Do not allow force pushes.
- Restrict who can push to matching branches (optional, recommended for teams).

Automation helper:

- Check current branch protection guardrails:
  - `npm run guardrails:check`
- Apply branch protection to `main` (requires repo admin permission):
  - `npm run guardrails:apply`
- Script path:
  - `scripts/repo-guardrails.ps1`

### 2) Required Status Checks

Use these check names from workflows in this repository:

- `build-frontend`
- `build-node-backend`
- `unit-core`
- `unit-node-backend`
- `lint-smoke`
- `python-syntax`
- `secret-scan`
- `e2e-windows`

### 3) CODEOWNERS

Repository path ownership is defined in `.github/CODEOWNERS`.

### 4) Secret Scanning (Pre-Commit + CI)

- Local pre-commit scan:
  - Install hook path once per clone: `npm run hooks:install`
  - Hook file: `.githooks/pre-commit`
  - Scanner script: `scripts/secret-scan.mjs --staged`
- CI secret scan:
  - Workflow: `.github/workflows/secret-scan.yml`
  - Job name: `secret-scan`

## Milestone B - End-to-End Validation

### High-Value Flow Coverage

Current high-value flow coverage is driven by `npm run verify` (launcher + smoke + unit tests) and includes:

1. Node sidecar health contract (`/health`).
2. Python sidecar health contract (`/health`).
3. Chat invalid argument behavior (`/api/chat`, `INVALID_ARGUMENT`).
4. Tools and security contract (`/api/tools`, sandbox/security/cli fields).
5. Multi-agent API contract (`/api/multi-agent/start`, `/groups`).
6. Python automation invalid argument contracts (window/browser endpoints).
7. OCR deterministic e2e contract (`/api/ocr`, when OCR dependency is healthy).
8. Static Rust/frontend contract consistency checks in `scripts/smoke.ps1`.

### Windows E2E CI with Retry + Artifacts

- Workflow: `.github/workflows/e2e-windows.yml`
- Job: `e2e-windows` on `windows-latest`
- Execution: `npm run verify`
- Flaky strategy: one automatic retry (2 attempts total)
- Failure/debug artifacts: `artifacts/e2e/verify-attempt-1.log`, `verify-attempt-2.log`
- Uploaded artifact name: `e2e-windows-logs`

### Verification Commands

- Local quick guardrail validation:
  - `npm run guardrails:check`
  - `npm run secret:scan:all`
  - `npm run verify:static`
- Full local validation:
  - `npm run verify`
