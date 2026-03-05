# Route Prompts

Copy/paste prompts for `kamiflow-core`.
For deterministic execution behavior, also follow `resources/docs/CODEX_FLOW_SMOOTH_GUIDE.md`.

## Route Profile Matrix

Use these defaults unless a higher-priority contract overrides them:

| Route | Profile | Intent | Default Next |
| --- | --- | --- | --- |
| `start` | `plan` | clarify and score options | `plan` |
| `plan` | `plan` | build-ready specification | `build` |
| `build` | `executor` | implement scoped tasks | `check` |
| `fix` | `executor` | resolve blockers from check findings | `check` |
| `check` | `review` | verify acceptance criteria and decide PASS/BLOCK | `fix` or `done` |
| `research` | `plan` | gather evidence and remove unknowns | `plan` |

Fallback order for all routes:

1. Reuse active plan.
2. Recover missing plan via `kfc flow ensure-plan --project .`.
3. Re-read contracts (`AGENTS.md`, `.kfc/CODEX_READY.md` when present).
4. Return `Status: BLOCK` with one concrete recovery action when still blocked.

## Plan Route

```text
$kamiflow-core plan check the .local/plans/<file>.md and produce a decision-complete implementation plan.
```

Expected:

- concrete scope
- profile: `plan`
- if `START_CONTEXT` is provided, consume it directly and do not re-ask baseline clarification
- if `START_CONTEXT` is absent and request is vague (missing 2+ core fields), reroute to `start` first
- resolve target plan file in this order:
  1. user-provided path
  2. active non-done plan
  3. create a new plan file only when no active plan exists or scope split is explicit
- if plan file resolution fails, return BLOCK with:
  - `Status: BLOCK`
  - `Reason: <single concrete cause>`
  - `Recovery: kfc flow ensure-plan --project .`
  - `Expected: {"ok":true,"plan_path":"<absolute-path>",...}`
- zero unresolved high-impact decisions
- Start Summary is present and non-placeholder
- build-ready checklist is explicitly satisfied:
  - explicit scope
  - file-level tasks
  - testable acceptance criteria
  - runnable validation commands
- plan frontmatter handoff is explicit (`next_command: build`, `next_mode: Build`)

Plan output example (ready):

```text
Plan markdown updated:
- decision: GO
- next_command: build
- next_mode: Build
```

Plan output example (blocked):

```text
Status: BLOCK
Reason: No target plan file was resolved.
Recovery: kfc flow ensure-plan --project .
Expected: {"ok":true,"plan_path":"<absolute-path>",...}
```

## Start Route

```text
$kamiflow-core start <topic>
```

Expected:

- profile: `plan`
- first turn asks 3-5 questions only
- each question has 3 options + `Other`
- second turn (after answers) includes:
  - problem analysis (problem, root causes, constraints)
  - clarity score (1-5) gate
  - exactly 3 tracks: Quick Win, Balanced, Ambitious
  - scored recommendation with one selected best solution
- includes `START_CONTEXT` block
- ends with exact `Run next:` command for `plan` and active-plan handoff

## Build Route

```text
$kamiflow-core build execute only Task <n> from .local/plans/<file>.md, list planned file-level actions first, then implementation and validation outcomes.
```

Expected:

- profile: `executor`
- no execution outside selected task scope
- build/fix updates `Implementation Tasks` only
- validation command outcomes
- explicit limitations
- plan frontmatter handoff to `check`
- do not claim completion without evidence; mark unknown claims as `Unknown`
- if API is unreachable, return BLOCK with:
  - `kfc plan serve --project <path> --port <n>`
  - health check `GET <base>/api/health`
- update plan via `kfc flow apply --project <path> --plan <id> --route build --result progress`
- include concise next-step guidance when useful (verbose footer optional)

## Check Route

```text
$kamiflow-core check verify current changes against Acceptance Criteria in .local/plans/<file>.md, list findings by severity, and return PASS or BLOCK.
```

Expected:

- profile: `review`
- findings-first output
- acceptance criteria status
- check phase validates/tests Acceptance Criteria
- PASS/BLOCK decision
- explicit next command (`fix` or `done`)
- if completion is below 100%, amend tasks/criteria and continue `build/fix -> check`
- on PASS with completion 100%, archive and keep latest 20 plans in `.local/plans/done/`
- if API is unreachable, return BLOCK with:
  - `kfc plan serve --project <path> --port <n>`
  - health check `GET <base>/api/health`
- apply decision via `kfc flow apply --project <path> --plan <id> --route check --result pass|block`
- include concise next-step guidance when useful (verbose footer optional)

When check result is `PASS`, automation apply auto-archives by default (`auto_archive_on_pass: true`).
