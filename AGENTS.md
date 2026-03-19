# Agent Instructions

This repository has four active scopes:

1. CLI product development in `src/` and `bin/`.
2. Plan UI product work in `packages/kfc-plan-web/` (Preact + signals + Eta shell, built browser assets in `dist/server/public`).
3. Dogfooding in `dogfood/` using linked or packed installs.
4. In-repo Codex skill/rules dogfooding from SSOT.

`resources/` is the SSOT area.

## Folder Contract

- `src/`: CLI product runtime and command implementation.
- `bin/`: runtime entrypoint scripts.
- `packages/`: workspace package boundaries (plan web, chat, web UI, session, runtime, etc.).
- `scripts/`: maintainer and workflow scripts, organized by domain (`scripts/client`, `scripts/codex`, `scripts/doc*`, etc.).
- `resources/`: portable SSOT (rules, skills, docs, templates).
- `dogfood/`: controlled in-repo fixtures for install/usage validation.
- `dist/`: repository build output (generated).
- `node_modules/`, `.local/`, `.npm-cache/`: local environment/caches and workflow state.

## Instruction Topology

- `AGENTS.md`: global boundaries, context routing, anti-pattern routing.
- `resources/rules/*`: enforceable command policy (`allow|prompt|forbidden`) by profile.
- `resources/skills/*`: behavior contracts, route discipline, output contracts, recovery logic.
- `resources/docs/CODEX_FLOW_SMOOTH_GUIDE.md`: deterministic execution checklist for stable route flow.
- `resources/docs/CHANGELOG.md`: tracked decision log for durable workflow and user-facing changes.
- `resources/templates/client-agents-shared-contract.md`: shared Kami Flow Core client-contract fragments injected into client-root `AGENTS.md` by `kfc client`.
- `.kfc/CODEX_READY.md`: runtime mission brief for client-project execution.
- `.local/plans/*.md`: live execution state and next action source of truth.

## Boundaries

- Keep canonical docs/skills/rules content in `resources/`.
- Keep canonical skill content in `resources/skills`.
- Keep shared runtime helper SSOT in `packages/kfc-runtime`; do not duplicate path-resolution helpers across `src/`, `scripts/`, and package code.
- Use TypeScript first in active typed packages. In `packages/kfc-plan-web/`, `packages/kfc-chat/`, and `packages/kfc-web-ui/`, prefer `.ts`/`.tsx` for source changes and do not add new `.js` source files unless a documented bridge exception requires it.
- Temporary JavaScript exceptions are allowed only where the current host/runtime boundary still needs them; keep those exceptions explicit and narrow.
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
- Every top-level implementation or workflow request must resolve one active non-done plan in `.local/plans/` before route output.
- Low-risk operational requests may use a no-plan fast path when they do not need acceptance criteria, phase/archive tracking, or multi-step workflow state.
- Allowed no-plan fast-path categories: commit/amend/reword, git status/diff/log, explain/summarize current state, sync generated docs/rules/skills, and narrow maintenance chores with low workflow risk.
- If a low-risk operational request expands into implementation-bearing work, switch back to the active-plan workflow before continuing.
- Every top-level implementation or workflow request must touch the active plan twice: once at route start, once before final response.
- A valid touch means updating `updated_at` and appending a timestamped `WIP Log` entry for what was done in that turn.
- Reuse the active plan by default; create a new plan file only when no active plan exists or the scope is explicitly split.
- Every route call must persist plan updates before final response.
- On `check` PASS with all Acceptance Criteria and Go/No-Go items checked, archive the plan to `.local/plans/done/`.
- If build readiness is unclear or blocked, do not continue implementation; switch to planning and run `$kamiflow-core plan`.
- Persist `next_command` and `next_mode` in plan frontmatter on every route; user-facing footer fields are optional.
- If `.kfc/CODEX_READY.md` is missing, continue with `AGENTS.md` + active `.local/plans/*.md` as runtime source of truth.

## Command Boundary

- In KFC repo (`kamiflow-codex-starter`), use `npm run ...` maintainer scripts.
- In client projects, use `kfc ...` (or `npx --no-install kfc ...`), not this repo's `npm run ...`.
- When a `kfc` command accepts `--project`, treat it as an override for out-of-tree targeting. If omitted, `kfc client`, `kfc flow`, `kfc plan`, and `kfc web` should auto-detect the nearest project root from the current working directory.
- Client bootstrap flow is `kfc client` -> Codex reads `.kfc/CODEX_READY.md` -> `kfc client done` for cleanup.
- Primary lifecycle behavior is direct markdown mutation in `.local/plans/*.md`; do not require `kfc flow ...` commands in normal route execution.
- `kfc flow ensure-plan` and `kfc flow ready` are fallback recovery commands when plan files are missing or inconsistent.

## Plan Lifecycle Contract

- File naming pattern for created plans: `YYYY-MM-DD-<seq>-<route>-<topic-slug>.md` (topic slug optional).
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
- Visibility note:
- `.local/` is git-ignored; do not use `git status` as proof that plan files were touched.

## Evidence Gate

- Do not present implementation or validation claims without evidence.
- Evidence must come from command output, repository files, or explicit user-provided data.
- If evidence is missing, state `Unknown` and route to `research` or `plan` instead of guessing.

## Smooth Flow Protocol

- Route discipline:
- Resolve active plan first, then execute exactly one route (`start|plan|build|check|fix|research`) per response.
- Build/Fix route scope: mutate and complete `Implementation Tasks` only; do not treat Acceptance Criteria as build-phase completion evidence.
- `Technical Solution Diagram` policy is controlled by `diagram_mode` (`required|auto|hidden`).
- `diagram_mode: required` means the Mermaid section is mandatory and must reflect implementation.
- `diagram_mode: auto|hidden` means Technical diagram is optional; KFC Plan should fall back to Tasks/Subtasks when absent.
- Accountability rule: after user clarification/answer in Brainstorm/Plan, decide if a technical diagram is needed; if needed, set `diagram_mode: required` and update the plan file with a Mermaid diagram (do not leave required mode without diagram content).
- Check route scope: verify/test `Acceptance Criteria` and decide PASS/BLOCK from evidence.
- After finishing implementation in a `build`/`fix` slice, run check validations before final response and report `Check: PASS|BLOCK` with evidence.
- During `build`/`fix`, after each completed task/subtask, immediately mutate the active plan file (checklist + timestamped `WIP Log` evidence) before starting the next subtask.
- Persist plan mutation before final response; never return route output without plan-state mutation.
- Response shape:
- Keep non-trivial route responses concise with `State`, `Doing`, and `Next`.
- Use plan frontmatter as canonical machine state (`selected_mode`, `next_command`, `next_mode`, `lifecycle_phase`).
- Check-to-done safety:
- Only treat task as done when archive succeeds (plan moved to `.local/plans/done/`).
- If completion is below 100% (remaining checklist items), do not archive; amend tasks/criteria and continue `Build/Fix -> Check`.
- If PASS is reported but archive fails, keep plan active and continue with recovery (`fix`/`plan`) instead of silent done.
- Environment recovery:
- If shell startup crashes from local profile modules, rerun commands with non-login/no-profile shell.

## Chat-Only Operation Contract

- Treat chat as the control plane: execute the workflow end-to-end without asking the user to run routine flow commands.
- Do not require the user to run `kfc`/`npm` commands for normal route execution when the agent can run them directly.
- Ask the user to run a command only when execution is impossible from agent context (for example: external terminal permissions, interactive auth, or environment outside workspace access).
- When escalation is needed, explain the blocker briefly and keep user action minimal.

## Surface Ownership Contract

- KFC surface hierarchy is explicit: automate through `Codex-CLI`, collaborate through Codex App/chat, and govern both through plan state plus evidence.
- Keep `Codex-CLI` as the canonical execution substrate for `codex exec`-style work that KFC wraps, replays, validates, and recovers.
- Keep Codex App/chat as the human-facing control plane for communication, planning, review, delegation, and session continuity.
- Keep app/browser surfaces observer-first by default: they may show state, guide next actions, bind or resume sessions, and explain recovery, but they must not become hidden execution engines.
- Keep KFC Plan observer-first and do not treat it as a competing execution surface.

## Markdown Readability Policy

- Emoji is allowed in human-facing markdown documentation and summaries to reduce wall-of-text.
- Keep machine contracts and command examples deterministic; avoid emoji inside command literals or parse-sensitive fields.
- Prefer light, consistent emoji markers (section headers, status cues), not decorative overuse.

## KFC Plan UI Rules

- Keep KFC Plan observer-first by default; do not reintroduce unsafe mutation/execute controls in observer mode.
- Preserve current KFC Plan architecture in `packages/kfc-plan-web` (Preact components + signal-driven UI state + Eta shell).
- Keep semantic, tokenized styles in `packages/kfc-plan-web/src/server/public/styles.css`.
- Avoid adding ad-hoc raw colors/spacing when semantic tokens already exist.
- For browser-facing KFC Plan changes, run the targeted Playwright lane: `npm run kfc-plan:test:browser`.
- Do not treat the Playwright lane as a repo-wide mandatory test for non-UI tasks.

## Design-System Gates

- KFC Plan UI changes must pass:
- `npm run docs:verify:kfc-plan-contrast`
- `npm run docs:verify:kfc-plan-spacing-grid`
- `npm run docs:verify:kfc-plan-design-system`
- `node packages/kfc-plan-web/test/run.mjs` (or `npm run -w @kamishino/kfc-plan-web test`)
- Color system policy is dual strategy: sRGB fallback + OKLCH harmonies.
- Layout spacing policy is 4px rhythm for layout spacing properties.
- Accessibility policy is WCAG 2.1 AA ratio + APCA-oriented thresholds via policy scripts.

## Anti-Pattern Router

- Source of truth: `resources/docs/CODEX_ANTI_PATTERNS.md`.
- Each anti-pattern must define: symptom, why wrong, and deterministic corrective command.
- Encode recurring anti-patterns as execution-policy rules where possible (`forbidden` or `prompt` with fix hint in docs).

## Commit Workflow

- Preferred commit path: `npm run commit:codex -- --message "type(scope): summary"`.
- `commit:codex` precomputes changed paths and passes them into docs-freshness verification so restricted shells do not rely on Node-side Git spawning for that gate.
- If local Git hooks fail with `env.exe` signal-pipe Win32 error 5, fallback to `git commit --no-verify`.
- If commit execution is still blocked after validation, fallback to `git commit --no-verify` and record the exact reason in your task note/summary.
- When fallback is used, record the reason in your task note/summary.

## Learning Loop Contract

- Source of truth: `resources/docs/CODEX_INCIDENT_LEDGER.md`.
- Any recurring incident (same signature more than once) must result in at least one durable guardrail:
- rules update in `resources/rules/*`, or
- skill update in `resources/skills/*`, or
- verification policy update in `scripts/policy/*`.
- Every incident entry must include a verification command that proves the guardrail.

## Documentation Freshness Contract

- Treat documentation refresh as a closeout gate for non-trivial work, not optional cleanup.
- At `check` closeout, review doc impact across:
- `AGENTS.md` for operating contract changes
- `resources/docs/ROADMAP.md` for repo direction/context changes
- `resources/docs/CHANGELOG.md` for durable workflow or user-facing decisions
- generated root mirrors (`QUICKSTART.md`, `CLIENT_KICKOFF_PROMPT.md`, `CHANGELOG.md`)
- `verify:docs-freshness` may emit an `agents-review` warning when workflow-surface files changed but `AGENTS.md` was not touched; treat that as a required review step and update `AGENTS.md` when the operating contract actually changed.
- Keep private memory in `.kfc/LESSONS.md` and `.local/kfc-lessons/`; never move private lessons into tracked repo docs.
- Before commit-safe completion, run `npm run docs:sync` and `npm run verify:governance` (the preferred commit helper does this automatically).

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
- Do not manually edit generated runtime outputs unless the task explicitly targets generated output behavior.

