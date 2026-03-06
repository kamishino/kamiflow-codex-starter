# Codex + KFP Runbook

Use this runbook to dogfood Kami Flow in this repo with predictable route behavior.
Prompt wording refinement only in this phase: no route logic changes.
For route execution discipline, also follow `resources/docs/CODEX_FLOW_SMOOTH_GUIDE.md`.

## Preconditions

- Node.js 20+
- `npm install` completed once at repo root
- Codex CLI available in PATH

## Command Policy

- Client-facing workflow commands use `kfc`.
- `kfp` is package-internal (`kamiflow-plan-ui`) and delegated by `kfc plan`.

## Canonical Local Flow

### Run in KFC Repo

1. Sync runtime skills from SSOT:

```bash
npm run codex:sync -- --profile dogfood --force
```

2. Initialize private plans directory and template (markdown-first lifecycle):

```bash
mkdir .local\plans
kfc plan init --project . --new
```

3. Validate plans:

```bash
kfc plan validate --project .
```

4. Serve local plan UI/API:

```bash
kfc plan serve --project . --port 4310
```

### Run in Client Project

When KFC is linked into a client repo, use `kfc` commands there (not `npm run` from this repo):

```bash
kfc client --force
kfc client doctor --project . --fix
```

Run from the client repository root (external project folder, not `kamiflow-codex-starter`).

5. Run Codex routes against one plan file:

- `start` route first when request is vague (missing 2+ core planning fields)
- `start` final output must include `START_CONTEXT` + exact `Run next:` command
- `plan` route must resolve/create target plan file in this exact order:
  1. user-provided file path
  2. active non-done plan
  3. create a new plan file only when no active plan exists or scope split is explicit
- if `START_CONTEXT` is present, consume it directly and do not re-ask baseline clarification
- if `START_CONTEXT` is absent and request remains vague, reroute to `start`
- if plan file cannot be resolved, return BLOCK with:
  - `Status: BLOCK`
  - `Reason: <single concrete cause>`
  - `Recovery: create .local/plans/<date-seq>-<route>.md from template`
  - `Expected: plan markdown exists and is writable`
- then finalize scope and gates
- `build` route only when plan is build-ready
- `build/fix` updates Implementation Tasks
- recommended preflight for build/fix route: evaluate readiness directly from the active plan markdown
- `check` route validates Acceptance Criteria after each build/fix slice
- if completion <100%, amend tasks/criteria and iterate `build/fix -> check`
- after PASS + done handoff with completion 100%, archive to `.local/plans/done/`

## Minimal Route Prompts

Plan:

```text
$kamiflow-core plan check the .local/plans/<file>.md and produce a decision-complete implementation plan.
```

Plan ready handoff contract (in plan markdown frontmatter):

```text
decision: GO
next_command: build
next_mode: Build
```

Build:

```text
$kamiflow-core build execute only Task <n> from .local/plans/<file>.md with file-level actions and validation results.
```

Check:

```text
$kamiflow-core check verify current changes against Acceptance Criteria in .local/plans/<file>.md and return PASS or BLOCK.
```

Deterministic persistence (direct markdown lifecycle):

```text
- Every top-level request resolves one active non-done plan first (reuse by default)
- Create a new plan file only when no active plan exists or the scope is explicitly split
- Every route updates frontmatter + WIP Log before final response
- build/fix focuses on Implementation Tasks; check validates Acceptance Criteria
- check PASS archives only when completion is 100% (Implementation Tasks + Acceptance Criteria checked)
- Keep latest 20 files in .local/plans/done/; prune older archived plans
```

Server resolution:

- Use `KFP_BASE_URL` when set.
- Default base URL: `http://127.0.0.1:4310`
- Preflight before mutation: `GET <base>/api/health` must return `{ "ok": true }`.

## Operator Rules

- One task slice per `build` cycle.
- Run targeted validation after each slice.
- Update WIP log in the plan each cycle.
- If scope/risk increases, reroute to `plan` or `research`.

## Activity Signal Semantics

KFP Activity panel is observer-first; use it as evidence, not control.

- Direct `POST /api/codex/action` controls are intentionally disabled (`CODEX_ACTION_DISABLED`).
- Runtime liveness should come from `.local/runs/<plan-id>.jsonl` updates streamed as `runlog_*` SSE events.
- Preferred control plane is chat-driven Codex execution; KFP remains read/observe oriented.
- Mermaid/flow diagrams in KFP should be shown in a dedicated **Technical Solution Diagram** section, not embedded inside PlanSnapshot status visualization.
- `Technical Solution Diagram` should contain a ```mermaid code block to persist chosen solution logic for future sessions/models.
- Mermaid safety standard: avoid raw `|` in node labels (for example decision text); use `/` or `or` in node label text to avoid parser failures.
- KFP may render a minimal derived placeholder when the section/block is missing, but canonical solution intent must come from plan markdown.
- KFP attempts pan/zoom controls via `svg-pan-zoom`; if unavailable, it falls back to static Mermaid rendering.
- Mermaid visualization is for humans; canonical execution truth is still plan markdown frontmatter + checklist sections.

- `Confidence High`: latest execution is successful and evidence is present.
- `Confidence Medium`: execution is running/successful but evidence is partial.
- `Confidence Low`: failures/blockers exist in current route cycle.
- `Confidence Unknown`: no recent evidence to score.

Failure-class hints from Codex events:

- `error_class: environment`: CLI availability/shell spawn/runtime environment issue.
- `error_class: configuration`: unsupported profile/config flags or mode negotiation mismatch.
- `error_class: timeout`: execution exceeded timeout budget.
- `error_class: runtime`: action ran but failed from prompt/input/runtime behavior.
- `error_class: unknown`: no deterministic classification; inspect stderr and route to `research`.

Evidence framing:

- `Evidence ready`: compact, concrete evidence exists for current cycle.
- `Needs evidence`: no reliable evidence found; treat claims as `Unknown` until validated.

## Fast Troubleshooting

### Run in KFC Repo

- Missing `.local/`: create `.local/plans/` and bootstrap from `packages/kamiflow-plan-ui/templates/plan-template.md`.
- If direct lifecycle is not possible (permissions/runtime issue), use fallback commands: `kfc flow ensure-plan --project .` and `kfc flow ready --project .`.
- Skill/rules mismatch after edits: run `npm run codex:sync -- --profile dogfood --force` and restart Codex CLI.
- Runtime skill still shows old commands: run `npm run codex:sync:skills -- --force` and restart Codex CLI.
- `request_user_input` unavailable in a Codex action run: use `mode_hint: Plan` (or include `request_user_input` in the action prompt). KFP now auto-tries Plan-profile/config variants first, then falls back to `codex exec -` if those flags are unsupported.
- Build route blocked: check `resources/docs/PLAN_CONTRACT_V1.md` build readiness gate.
