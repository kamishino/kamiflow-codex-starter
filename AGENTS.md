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
- Before any implementation route (`build`/`fix`), run:
- `kfc flow ensure-plan --project .`
- `kfc flow ready --project .`
- If readiness fails, do not continue implementation; switch to planning and run `$kamiflow-core plan`.
- End every non-trivial response with explicit `Next Command` and `Next Mode`.
- If `.kfc/CODEX_READY.md` is missing, continue with `AGENTS.md` + active `.local/plans/*.md` as runtime source of truth.

## Command Boundary

- In KFC repo (`kamiflow-codex-starter`), use `npm run ...` maintainer scripts.
- In client projects, use `kfc ...` (or `npx --no-install kfc ...`), not this repo's `npm run ...`.
- Client bootstrap flow is `kfc client` -> Codex reads `.kfc/CODEX_READY.md` -> `kfc client done` for cleanup.
- Before entering implementation routes (`build`/`fix`), resolve or create the active plan file via `kfc flow ensure-plan --project .`.
- Before entering implementation routes (`build`/`fix`), verify readiness via `kfc flow ready --project .`.

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
