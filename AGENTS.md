# Agent Instructions

This repository has four active scopes:

1. CLI product development in `src/` and `bin/`.
2. Plan UI product work in `packages/kamiflow-plan-ui/` (Preact + signals + Eta shell, built browser assets in `dist/server/public`).
3. Dogfooding in `dogfood/` using linked or packed installs.
4. In-repo Codex skill/rules dogfooding from SSOT.

`resources/` is the SSOT area.

## Instruction Topology

- `AGENTS.md`: global boundaries, context routing, anti-pattern routing.
- `resources/rules/*`: enforceable command policy (`allow|prompt|forbidden`) by profile.
- `resources/skills/*`: behavior contracts, route discipline, output contracts, recovery logic.
- `.kfc/CODEX_READY.md`: runtime mission brief for client-project execution.
- `.local/plans/*.md`: live execution state and next action source of truth.

## Boundaries

- Keep canonical docs/skills/rules content in `resources/`.
- Keep canonical skill content in `resources/skills`.
- Treat `.agents/skills` as generated runtime output, not manual-edit files.
- Keep rules SSOT in `resources/rules/base.rules` and `resources/rules/profiles/*.rules`.
- Treat `.codex/rules/kamiflow.rules` as generated runtime output, not manual-edit files.
- Keep `.codex/rules/default.rules` for Codex-managed approvals; do not overwrite it from SSOT.
- Never commit private/secrets-bearing `.codex` runtime config.
- Do not import `src/*` directly from dogfood fixtures.
- Dogfood fixtures must consume the CLI as users do (`npm link` or tarball install).

## Context Resolver

- Repo context (`kamiflow-codex-starter`): use `npm run ...` maintainer commands.
- Client-project context: use `kfc ...` (or `npx --no-install kfc ...`), never repo-only `npm run ...`.
- Client bootstrap flow: `kfc client` -> Codex reads `.kfc/CODEX_READY.md` -> `kfc client done`.

## Session Bootstrap Contract

- Every new session must start by reading `AGENTS.md`.
- If `.kfc/CODEX_READY.md` exists, read it before implementation.
- Every top-level user request must resolve one active non-done plan in `.local/plans/` before route output.
- Reuse the active plan by default; create a new plan file only when no active plan exists or the scope is explicitly split.
- Every route call must persist plan updates before final response.
- On `check` PASS with all Acceptance Criteria and Go/No-Go items checked, archive the plan to `.local/plans/done/`.
- If build readiness is unclear or blocked, do not continue implementation; switch to planning and run `$kamiflow-core plan`.
- Persist `next_command` and `next_mode` in plan frontmatter on every route; user-facing footer fields are optional.
- If `.kfc/CODEX_READY.md` is missing, continue with `AGENTS.md` + active `.local/plans/*.md` as runtime source of truth.

## Command Boundary

- In KFC repo (`kamiflow-codex-starter`), use `npm run ...` maintainer scripts.
- In client projects, use `kfc ...` (or `npx --no-install kfc ...`), not this repo's `npm run ...`.
- Client bootstrap flow is `kfc client` -> Codex reads `.kfc/CODEX_READY.md` -> `kfc client done` for cleanup.
- Primary lifecycle behavior is direct markdown mutation in `.local/plans/*.md`; do not require `kfc flow ...` commands in normal route execution.
- `kfc flow ensure-plan --project .` and `kfc flow ready --project .` are fallback recovery commands when plan files are missing or inconsistent.

## Plan Lifecycle Contract

- File naming pattern for created plans: `YYYY-MM-DD-<seq>-<route>.md`.
- Create plan files only when required:
- no active non-done plan exists, or
- user explicitly asks to split work into a separate plan.
- Every created file should include:
- `request_id`
- `parent_plan_id` (when a previous active plan exists)
- `lifecycle_phase` (`start|plan|build|check|fix|research|done`)
- `archived_at` (set when archived)
- Direct mutation minimum per route:
- frontmatter fields (`updated_at`, `selected_mode`, `next_command`, `next_mode`, `status`, `decision`)
- `WIP Log` lines (`Status`, `Blockers`, `Next step`)
- Archive gate:
- Only archive on `check` PASS when all Acceptance Criteria and Go/No-Go checklist items are checked.
- Done retention:
- Keep the most recent 20 files in `.local/plans/done/`; prune older done files during normal plan-lifecycle maintenance.

## Evidence Gate

- Do not present implementation or validation claims without evidence.
- Evidence must come from command output, repository files, or explicit user-provided data.
- If evidence is missing, state `Unknown` and route to `research` or `plan` instead of guessing.

## KFP UI Rules

- Keep KFP observer-first by default; do not reintroduce unsafe mutation/execute controls in observer mode.
- Preserve current KFP architecture in `packages/kamiflow-plan-ui` (Preact components + signal-driven UI state + Eta shell).
- Keep semantic, tokenized styles in `packages/kamiflow-plan-ui/src/server/public/styles.css`.
- Avoid adding ad-hoc raw colors/spacing when semantic tokens already exist.

## Design-System Gates

- KFP UI changes must pass:
- `npm run docs:verify:kfp-contrast`
- `npm run docs:verify:kfp-spacing-grid`
- `npm run docs:verify:kfp-design-system`
- `node packages/kamiflow-plan-ui/test/run.mjs` (or `npm run -w @kamishino/kamiflow-plan-ui test`)
- Color system policy is dual strategy: sRGB fallback + OKLCH harmonies.
- Layout spacing policy is 4px rhythm for layout spacing properties.
- Accessibility policy is WCAG 2.1 AA ratio + APCA-oriented thresholds via policy scripts.

## Anti-Pattern Router

- Source of truth: `resources/docs/CODEX_ANTI_PATTERNS.md`.
- Each anti-pattern must define: symptom, why wrong, and deterministic corrective command.
- Encode recurring anti-patterns as execution-policy rules where possible (`forbidden` or `prompt` with fix hint in docs).

## Commit Workflow

- Preferred commit path: `npm run commit:codex -- --message "type(scope): summary"`.
- If local Git hooks fail with `env.exe` signal-pipe Win32 error 5, fallback to `git commit --no-verify`.
- When fallback is used, record the reason in your task note/summary.

## Learning Loop Contract

- Source of truth: `resources/docs/CODEX_INCIDENT_LEDGER.md`.
- Any recurring incident (same signature more than once) must result in at least one durable guardrail:
- rules update in `resources/rules/*`, or
- skill update in `resources/skills/*`, or
- verification policy update in `scripts/policy/*`.
- Every incident entry must include a verification command that proves the guardrail.

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
- Do not manually edit generated runtime outputs unless the task explicitly targets generated output behavior.
