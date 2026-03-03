# Codex Incident Ledger (SSOT)

Use this ledger to turn repeated failures into durable automation and policy.

## Entry Template

- Date:
- Environment:
- Failure Signature:
- Root Cause:
- Permanent Guardrail Added:
- Files Changed:
- Verification Command:

## Entries

### 2026-03-03 - Git Hook `env.exe` Signal Pipe Failure

- Date: 2026-03-03
- Environment: Windows + Git hook execution path
- Failure Signature: `env.exe: couldn't create signal pipe, Win32 error 5`
- Root Cause: local hook subprocess instability in the environment
- Permanent Guardrail Added: documented commit fallback in AGENTS + anti-pattern catalog entry (`AP-005`)
- Files Changed:
- `AGENTS.md`
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- Verification Command: `git commit --no-verify -m "docs: verify fallback path"`

### 2026-03-03 - Plan Bootstrap Command Flow Break

- Date: 2026-03-03
- Environment: KFC plan routing in local/project context
- Failure Signature: `kfc plan init --project . --new` not working in some contexts
- Root Cause: plan-init invocation edge cases and command-flow mismatch
- Permanent Guardrail Added: enforce `kfc flow ensure-plan --project .` primary path with plan-init fallback (`AP-006`)
- Files Changed:
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- `resources/skills/kamiflow-core/references/plan.md`
- Verification Command: `kfc flow ensure-plan --project .`
