# P0 Test Failure Triage

This note classifies current failing tests into two groups:

- failures introduced by this P0 hardening batch
- pre-existing failures in the working tree baseline

## 1) Triage Summary

### A. Node backend runtime tests

- Suite: `sidecars/node-backend/src/agent/runtime.test.ts`
- Default run failure:
  - `persists session messages and reuses them across calls`
  - `uses default maxIterations=50 when env is not set`
- Root cause:
  - Tests expect Anthropic path (`anthropicCreateMock`) but do not set
    `CHUBAO_AI_PROVIDER=anthropic`.
  - Runtime defaults provider to OpenAI when provider env is missing.
- Evidence:
  - Fails with default env (`AI Provider: openai`).
  - Passes when forcing provider:
    - `CHUBAO_AI_PROVIDER=anthropic npx vitest run sidecars/node-backend/src/agent/runtime.test.ts`
- Classification: **pre-existing test setup mismatch** (not caused by P0 persistence/security changes).

### B. Frontend core executor/orchestrator tests

- Suites:
  - `src/core/executor/taskExecutor.test.ts`
  - `src/core/orchestrator/chatOrchestrator.test.ts`
- Current failures:
  - tests expect step-trace prefixes like `[1/1] ... timeout=...`
  - current `executePlan` returns merged step content only (no step-trace prefix)
- Evidence:
  - `src/core/executor/taskExecutor.ts` appends plain step output and errors.
  - Tests assert prefixed lines that are not emitted by current executor.
- Classification: **pre-existing behavior/test contract drift**.

### C. P0 batch regression status

- P0 changes verified as passing for build/static checks:
  - `npm run build` (frontend)
  - `npm run build` in `sidecars/node-backend`
  - `npm run verify:static`
  - `python -m compileall sidecars/python-automation`
  - `npx tsc --noEmit`
  - `npx tsc --noEmit -p sidecars/node-backend/tsconfig.json`
- Classification: **no direct P0 regression detected** in these gates.

## 2) Executable Fix List

### Priority 1 - Runtime test environment stabilization

1. In `sidecars/node-backend/src/agent/runtime.test.ts` `beforeEach`, set:
   - `process.env.CHUBAO_AI_PROVIDER = 'anthropic';`
2. (Optional) Add a dedicated provider-selection unit test asserting default behavior.
3. Keep current Anthropic mock expectations unchanged.

Expected outcome:

- `npm run test:node-backend` no longer fails in `runtime.test.ts` because of provider mismatch.

### Priority 2 - Decide and unify executor output contract

Choose one path and apply consistently:

- **Option A (recommended now):** update tests to current executor output (no step-prefix lines).
- **Option B:** restore step-prefix formatting in `executePlan` and keep current tests.

Why Option A now:

- minimal risk for P0 scope,
- avoids touching production-facing response formatting,
- fastest to green tests.

Expected outcome:

- `src/core/executor/taskExecutor.test.ts` and
  `src/core/orchestrator/chatOrchestrator.test.ts` aligned with actual output contract.

### Priority 3 - Add contract lock test

1. Add one focused test in `taskExecutor.test.ts` for the chosen formatting contract.
2. Avoid asserting verbose strings that are likely to churn; prefer key markers.

Expected outcome:

- prevent repeated drift between implementation and test expectations.

## 3) Suggested Command Order After Fixes

1. `npm run test:core`
2. `npm run test:node-backend`
3. `npm run verify:static`
4. `python -m compileall sidecars/python-automation`
