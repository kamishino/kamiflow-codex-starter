---
name: kamiflow-core
description: Core Kami Flow workflow router for start, plan, build, check, research, and fix execution. Use when users ask to start an idea, plan work, build changes, check quality, research unknowns, or fix targeted issues in a consistent project workflow.
---

# Kami Flow Core

Use this as the default workflow router for non-trivial work.
It helps you choose the right route, enforce mode discipline, and finish with a clear next step.

## Mode Selector

Pick mode before executing route logic:

- `start` -> `Plan`
- `plan` -> `Plan`
- `research` -> `Plan`
- `build` -> `Build`
- `fix` -> `Build`
- `check` -> `Plan` by default; use `Build` only when running commands/tests or proposing file edits.

## Routing Workflow

1. Read `references/command-map.md`.
2. Classify the request into one primary route candidate plus one fallback.
3. Assign `Route Confidence` (`1-5`) for the primary route.
4. If route confidence is below `4`, reroute to `start`, `plan`, or `research` and stop route execution.
5. Resolve the required mode from the chosen route.
6. If mode is incompatible, return `MODE_MISMATCH` and stop.
7. Load only the matched route reference file.
8. Produce output in that route's required shape.
9. Provide concise next-step guidance when helpful; persist command/mode handoff in plan metadata.
10. Evaluate transition via shared policy (`evaluateRouteTransition`) and persist continuity before route transitions:
   - `route_confidence` (`1`-`5`)
   - `flow_guardrail` (`route_alignment`, `mode_guard`, `readiness_gate`, `readiness_pass`, `transition_guard`, `execution`, `loop_guard`)
   - `WIP Log` (`Status`, `Blockers`, `Next step`)

## Route Confidence Gate

- Evaluate confidence using:
  - request intent fit with route purpose
  - availability of route-required artifacts (active plan, acceptance scope, evidence inputs)
  - unknown/risk level that could invalidate execution
- Confidence decision:
  - `4-5`: execute selected route
  - `<4`: do not execute selected route; reroute to one safer route
- If route confidence is below `4`, reroute to `start`, `plan`, or `research`.
- Fallback mapping:
  - unclear intent -> `start`
  - unknown facts/high risk -> `research`
  - missing build-ready plan state -> `plan`
- On reroute, return:
  - `Status: REROUTE`
  - `Route Confidence: <1-5>`
  - `Fallback Route: <start|plan|research>`
  - `Reason: <one line>`

## Command Routes

- `start` -> `references/start.md`
- `plan` -> `references/plan.md`
- `build` -> `references/build.md`
- `check` -> `references/check.md`
- `research` -> `references/research.md`
- `fix` -> `references/fix.md`

## Sub-Agent Orchestration Contract

- Use `spawn_agent` only when work can be split into independent ownership slices.
- Do not spawn for tightly-coupled file regions or strict sequence dependencies.
- Before spawning, persist in plan notes:
  - orchestration path (`full` or `fast`) and phase plan,
  - ownership map (`agent -> file scope`),
  - deliverables per agent,
  - merge/review order,
  - conflict fallback policy.
- Require each sub-agent output to include:
  - concrete file list,
  - findings or patch intent,
  - risk/blocker summary,
  - check confidence.
- Recommended optional frontmatter controls:
  - `orchestrator_mode`: `none|optional|required`
  - `agent_slices`: `[{ "role": "WorkerA", "files": [...], "deliverables": [...] }, ...]`
  - `max_parallel_workers`: number of concurrent workers
- Use a 5-phase gate for larger parallel sessions:
  1. Assess -> split is valid and low-risk.
  2. Split -> map ownership and assign agents.
  3. Execute -> run workers only when boundaries are clean.
  4. Merge -> reconcile conflicts deterministically.
  5. Close -> validate acceptance evidence and decide PASS/BLOCK.
- For any detected conflict (especially High severity):
  - require a reviewer gate before merge.
  - capture a conflict record: `files`, `conflict`, `reviewer`, `decision`, `rationale`, `recovery`.
  - route to serial resolution before next non-conflict slice.
- After each slice, immediately update plan WIP (`Status`, `Blockers`, `Next step`) before starting the next.
- If conflicts appear, set impacted files to single-agent mode and continue with non-conflicting slices in parallel.
- Keep one route per response; sub-agent work supports that route only.

## Trigger Contract

- Trigger this skill for non-trivial workflow requests that need one of:
  - request clarification and option design (`start`)
  - decision-complete planning (`plan`)
  - scoped implementation (`build`)
  - verification decisions (`check`)
  - evidence gathering (`research`)
  - optional feature ideation/inspiration discovery (`research` ideation preset)
  - targeted remediation (`fix`)
- If request is trivial and low-risk operational, do not force this skill; use the no-plan fast path instead.

## Boundaries Contract

- Must:
  - execute exactly one route per response.
  - resolve one active non-done plan before route output for implementation/workflow requests.
  - mutate plan state directly in markdown before final response for implementation/workflow requests.
  - allow the no-plan fast path only for low-risk operational requests that do not need acceptance criteria, phase/archive tracking, or multi-step workflow state.
- Must not:
  - mix `Implementation Tasks` and `Acceptance Criteria` scope incorrectly (`build/fix` vs `check`).
  - use the no-plan fast path for implementation-bearing work.
  - claim PASS, completion, or done without concrete evidence.
  - require routine user-run commands when agent execution is possible.

## Route Output Contract

- All non-trivial route responses must use compact sections:
  - `State`
  - `Doing`
  - `Next`
- Route references may define additional route-specific blocks, but compact guidance remains mandatory.

## Evidence Contract

- Every claim must be evidence-backed by command output, repository file state, or explicit user-provided data.
- If evidence is unavailable or inconclusive, mark status as `Unknown` and reroute to `research` or `plan`.
- `check` decisions (`PASS|BLOCK`) must include validation evidence.

## Global Rules

- Keep output concise, structured, and human-readable.
- No emoji in machine-critical contract fields.
- Emoji is allowed in human-facing markdown summaries/docs when it improves readability.
- Do not skip required gates in the selected route reference.
- If scope or risk increases, route back to `research` or `plan`.
- For vague feature-discovery requests, prefer `research` ideation preset before `start`.
- If route confidence is below `4`, reroute instead of forcing the selected route.
- If mode does not satisfy route requirements, do not continue.
- Chat-first operation: run workflow commands directly instead of asking the user to run routine flow commands.
- In client projects, if `.kfc/LESSONS.md` exists, read it as curated durable project memory before implementation.
- In client projects, if `.kfc/CODEX_READY.md` exists, treat its repo-shape inspection summary and onboarding handoff as authoritative until evidence shows drift.
- Every top-level implementation or workflow request must resolve one active non-done plan in `.local/plans` before route output.
- Low-risk operational requests may use the no-plan fast path when they do not need acceptance criteria, phase/archive tracking, or multi-step workflow state.
- Allowed no-plan fast-path categories: commit/amend/reword, git status/diff/log, explain/summarize current state, sync generated docs/rules/skills, and narrow maintenance chores with low workflow risk.
- If a low-risk operational request expands into implementation-bearing work, switch back to the active-plan workflow before continuing.
- Reuse the active plan by default; create a new plan file only when no active plan exists or scope is explicitly split.
- Every route invocation persists plan-state changes directly in markdown before final output.
- Prefer direct plan-file mutation as primary lifecycle path; use `kfc flow ...` only as recovery fallback.
- Build/Fix phase focuses on `Implementation Tasks`; Check phase evaluates `Acceptance Criteria`.
- `diagram_mode` policy must be explicit in plan frontmatter (`required|auto|hidden`) and respected during Start/Plan/Build routes.
- After user clarifies answers in Brainstorm/Plan, decide whether a technical diagram is needed; if needed, set `diagram_mode: required` and update the plan file with Mermaid content before handoff.
- Mermaid safety standard: avoid raw `|` in node labels inside `Technical Solution Diagram`; use `/` or `or` in label text to prevent parser errors.
- Client-facing command guidance must use `kfc` (not direct `kfc-plan`), except package-internal docs.
- Never claim completion, validation, or behavior without evidence from commands/files/user-provided facts.
- If evidence is unavailable, mark status as `Unknown` and reroute to `research` or `plan`.
- At check/closeout, review docs impact for workflow, onboarding, and durable user-facing changes; refresh tracked docs and generated mirrors before claiming commit-safe completion.
- When workflow-surface files changed, review `AGENTS.md` for operating-contract drift even if docs-freshness only emits a warning.
- Keep private project memory in `.kfc/LESSONS.md` and `.local/kfc-lessons/`; do not move private lessons into tracked repo docs.

## Smooth Flow Checklist

1. If request matches the low-risk operational no-plan fast path, execute it directly and do not force route or plan lifecycle handling.
2. Otherwise resolve one active plan before route logic.
3. Touch active plan at route start (`updated_at` + WIP line).
4. Pick exactly one route and one mode.
5. Record `Route Confidence` (`1-5`) and reroute when score is below `4`.
6. Execute one scoped slice only (avoid multi-route mixing in one output).
7. Mutate plan frontmatter + WIP Log before final response.
8. Touch active plan again before final output to persist actual results from this turn.
9. State claims only with evidence; otherwise label `Unknown`.
10. Keep user response compact: `State`, `Doing`, `Next`.
11. After finishing implementation in a `build`/`fix` slice, run check validations and report `Check: PASS|BLOCK` before final response.
12. During `build`/`fix`, after each completed task/subtask, immediately mutate the active plan file (checklist + timestamped WIP evidence) before moving to the next subtask.
13. During `check` closeout, review docs impact, update tracked docs as needed, and keep private memory updates on the `.kfc/.local` lane.
14. If completion is below 100%, amend remaining tasks/criteria and continue `build/fix -> check` loop instead of forcing done.
15. Treat completion as valid only after archive success.
16. If runtime/shell environment is broken, switch to a safe fallback shell mode and continue.

## Plan Lifecycle Protocol

- Naming: `YYYY-MM-DD-<seq>-<route>-<topic-slug>.md` (topic slug optional).
- Active plan policy:
- resolve and reuse one active non-done plan by default.
- create a new plan file only when none exists or scope split is explicit.
- Required frontmatter fields (core):
- `plan_id`
- `status`
- `decision`
- `selected_mode`
- `next_command`
- `next_mode`
- `updated_at`
- Optional tracking metadata:
- `request_id`
- `parent_plan_id`
- `lifecycle_phase`
- `archived_at`
- Minimum mutation on every route:
- update `updated_at`
- update `lifecycle_phase`
- update `WIP Log` (`Status`, `Blockers`, `Next step`)
- Archive condition:
- on `check` PASS, archive only when Acceptance Criteria and Go/No-Go checklist items are fully checked.
- Done retention:
- keep latest 20 files in `.local/plans/done/`; prune older done files during lifecycle maintenance.

## Failure Recovery

- Command boundary mismatch:
  - Symptom: repo-only `npm run ...` shown or used in client project.
  - Recovery: switch to `kfc client` (or `kfc client bootstrap --project . --profile client`) and continue with `kfc ...`.
- Duplicate client bootstrap:
  - Symptom: `.kfc/CODEX_READY.md` already exists but bootstrap is suggested again without a concrete environment failure.
  - Recovery: continue from the ready brief and active plan; rerun `kfc client` only when setup evidence is missing or broken.
- Codex invocation/quoting failure:
  - Symptom: `spawn codex ENOENT` or `unexpected argument` from `codex exec`.
  - Recovery: persist plan state directly in markdown first; if manual fallback is required use the exact printed fallback command in plain `codex exec ...` format (not `codex.cmd`) and re-run it.
- Plan bootstrap failure:
  - Symptom: plan file missing or `kfc plan init ... --new` fails in flow.
  - Recovery: create plan markdown directly from template; fallback: `kfc flow ensure-plan --project .` or `kfc plan init --project . --new`.
- Readiness gate failure:
  - Symptom: plan lacks build-ready gates (`decision`, handoff mode/command, unresolved checklist items).
  - Recovery: do not run `build`/`fix`; switch to planning and run `$kamiflow-core plan` after addressing blockers.
- Git hook signal-pipe failure:
  - Symptom: `env.exe ... couldn't create signal pipe, Win32 error 5`.
  - Recovery: use `git commit --no-verify -m "<message>"` and record fallback reason in task summary.

## Mode Mismatch Policy

When current mode is incompatible, output:

- `Status: MODE_MISMATCH`
- `Required Mode: Plan|Build`
- `Current Mode: Plan|Build`
- `Reason: <one line>`
- `Instruction: Switch mode and rerun the same command.`

## Response Handoff Contract

- Verbose response footers are optional.
- Route handoff state is authoritative in plan markdown (`selected_mode`, `next_command`, `next_mode`, `lifecycle_phase`, `updated_at`).
- Prefer one concise next-step sentence in user-facing output when it improves clarity.
