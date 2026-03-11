# Codex Incident Ledger (SSOT)

Use this ledger to turn repeated failures into durable automation and policy.

## Signature Taxonomy

Classify each incident with a stable signature to avoid duplicate/ambiguous entries.

- `CMD-*`: command invocation and shell/runtime failures.
- `PLAN-*`: plan lifecycle or state mutation failures.
- `CHK-*`: check/archive gate and validation failures.
- `DOC-*`: documentation contract drift.

Guardrail expectation:

- first occurrence: document incident and local mitigation.
- recurrence (>=2 with same signature family): add durable guardrail in rules/skills/policy and record verification command.

## Entry Template

- Date:
- Environment:
- Signature ID:
- Failure Signature:
- Recurrence Count:
- Root Cause:
- Guardrail Type: `rules | skill | policy | docs`
- Permanent Guardrail Added:
- Files Changed:
- Verification Command:

## Entries

### 2026-03-03 - Git Hook `env.exe` Signal Pipe Failure

- Date: 2026-03-03
- Environment: Windows + Git hook execution path
- Signature ID: CMD-HOOK-001
- Failure Signature: `env.exe: couldn't create signal pipe, Win32 error 5`
- Recurrence Count: 2
- Root Cause: local hook subprocess instability in the environment
- Guardrail Type: `rules | skill | docs`
- Permanent Guardrail Added: documented commit fallback in AGENTS + anti-pattern catalog entry (`AP-005`)
- Files Changed:
- `AGENTS.md`
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- Verification Command: `git commit --no-verify -m "docs: verify fallback path"`

### 2026-03-03 - Plan Bootstrap Command Flow Break

- Date: 2026-03-03
- Environment: KFC plan routing in local/project context
- Signature ID: PLAN-BOOTSTRAP-001
- Failure Signature: `kfc plan init --project . --new` not working in some contexts
- Recurrence Count: 2
- Root Cause: plan-init invocation edge cases and command-flow mismatch
- Guardrail Type: `skill | docs`
- Permanent Guardrail Added: enforce `kfc flow ensure-plan --project .` primary path with plan-init fallback (`AP-006`)
- Files Changed:
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- `resources/skills/kamiflow-core/references/plan.md`
- Verification Command: `kfc flow ensure-plan --project .`

### 2026-03-04 - Implementation Route Skipped Plan Resolution

- Date: 2026-03-04
- Environment: KFC route execution (`build`/`fix`) in repo and client contexts
- Signature ID: PLAN-LIFECYCLE-001
- Failure Signature: implementation started without resolving target `.local/plans/*.md`
- Recurrence Count: 2
- Root Cause: implementation route contracts did not explicitly enforce plan resolution preflight
- Guardrail Type: `skill | policy | docs`
- Permanent Guardrail Added: enforce `kfc flow ensure-plan --project <path>` preflight + BLOCK fallback in `build`/`fix`; add AP-007 and skill-contract verification tokens
- Files Changed:
- `AGENTS.md`
- `resources/skills/kamiflow-core/SKILL.md`
- `resources/skills/kamiflow-core/references/build.md`
- `resources/skills/kamiflow-core/references/fix.md`
- `scripts/policy/verify-kamiflow-skill-contract.ts`
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- Verification Command: `npm run docs:verify:skills-contract`

### 2026-03-10 - Documentation Freshness Drift

- Date: 2026-03-10
- Environment: Repo governance and closeout workflow
- Signature ID: DOC-FRESHNESS-001
- Failure Signature: workflow and onboarding changes landed without a consistent route for updating tracked docs, generated mirrors, and decision history
- Recurrence Count: 2
- Root Cause: partial doc sync automation existed for a few mirrors, but there was no classifier/gate tying workflow changes to required doc updates
- Guardrail Type: `policy | docs | skill`
- Permanent Guardrail Added: added docs freshness classifier, unified docs artifact sync, commit-safe docs/governance validation, and explicit closeout guidance in AGENTS + skill/check docs
- Files Changed:
- `AGENTS.md`
- `resources/docs/CODEX_FLOW_SMOOTH_GUIDE.md`
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- `resources/docs/CHANGELOG.md`
- `resources/skills/kamiflow-core/SKILL.md`
- `resources/skills/kamiflow-core/references/check.md`
- `scripts/policy/verify-docs-freshness.ts`
- Verification Command: `npm run docs:verify:docs-freshness`

### 2026-03-11 - `commit:codex` Blocked by Docs-Freshness Git Spawn

- Date: 2026-03-11
- Environment: restricted/sandboxed shell during repo commit workflow
- Signature ID: CMD-COMMIT-002
- Failure Signature: `verify:docs-freshness` fails with `Git execution is blocked in this environment` inside `npm run commit:codex`
- Recurrence Count: 1
- Root Cause: the commit helper invoked governance normally, but the docs-freshness verifier always spawned Git from Node instead of reusing changed-file context that the caller could provide.
- Guardrail Type: `policy | docs`
- Permanent Guardrail Added: `commit:codex` now precomputes changed paths and injects them into docs-freshness verification; verifier accepts injected changed paths before falling back to direct Git inspection.
- Files Changed:
- `AGENTS.md`
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- `resources/docs/CODEX_INCIDENT_LEDGER.md`
- `scripts/git-hooks/commit-with-validation.ps1`
- `scripts/policy/verify-docs-freshness.ts`
- Verification Command: `node dist/scripts/policy/verify-docs-freshness.js --changed-paths-json "[\"packages/kfc-web/src/server.ts\",\"resources/docs/CHANGELOG.md\"]"`
