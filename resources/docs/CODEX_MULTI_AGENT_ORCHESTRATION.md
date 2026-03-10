# Codex Multi-Agent Orchestration

Use this guide when one request is too broad for a single linear execution slice.

## Phase Model (Default)

For broad work, use a 5-phase lifecycle. A 3-phase fast path is allowed only for low-risk, well-scoped tasks.

### 5-Phase Lifecycle

1. **Assess**
   - Confirm scope, risk, dependencies, and whether the request is safe for parallelism.
   - Output: `Scope`, `Constraints`, `Acceptance candidates`, `Plan needed`.
2. **Split**
   - Build explicit ownership map (`agent -> file set`), identify blockers, and define merge order.
   - Output: `agent_slices`, `Parallelization Gate`, `Conflict fallback`.
3. **Execute**
   - Run independent workers/explorers in parallel.
   - Output: scoped patches + evidence per worker.
4. **Merge**
   - Resolve conflicts and integrate results in the agreed sequence.
   - Output: single coherent patch set + conflict log.
5. **Close**
   - Validate evidence and decide PASS/BLOCK.
   - Output: acceptance evidence, WIP update, run-log continuity.

### 3-Phase Fast Path

If independent slices are hard to isolate, or if scope is narrow, use:

- Assess
- Execute (single-agent)
- Close

Always record the chosen path in WIP before spawn.

## Import Note

External orchestrator repos (for example, `oh-my-opencode-slim`) are useful design references, but Kami Flow does not require installing new skills for generic sub-agent coordination.

Use these built-in capabilities instead:

- this SSOT skill (`kamiflow-core`) for deterministic route routing,
- plan-based checkpointing in `.local/plans/*.md`,
- and Codex sub-agent tools (`spawn_agent`, `send_input`, `wait`, `close_agent`) when scopes are independent.

## When To Use Multi-Agent

Use multi-agent orchestration when:

- work can be split into independent file ownership slices.
- research, implementation, and validation can run in parallel.
- a single-agent pass would create high context switching overhead.

Avoid multi-agent mode when:

- task is small and can be finished safely by one agent.
- edits are tightly coupled in the same file region.
- merge risk is higher than expected parallel speedup.
- task requires immediate one-pass reasoning with strict sequence dependency.

## Parallelization Gate

Before spawning agents, confirm these:

- Work chunks are independent and file ownership can be assigned without overlap.
- Each chunk can return verifiable evidence in one short message.
- The lead can define a deterministic merge order.
- There is no hard dependency on another slice producing source artifacts before a second slice can start.

If any condition fails, run single-agent workflow.

## Role Contract

Default role set:

- Lead
  - Keeps `.local/plans` as source of truth.
  - Assigns ownership and sequence constraints.
  - Merges outputs with conflict rules.
- Explorer
  - Produces scoped evidence only.
  - Returns: file paths, risks, assumptions, and dependencies.
- Worker
  - Owns one or more explicit file sets.
  - Returns patch intent + validation notes.
- Reviewer
  - Validates acceptance evidence.
  - Returns PASS/BLOCK with reasons and exact checks run.

Optional role:

- Orchestrator
  - Coordinates many worker streams for large programs.
  - Only enabled when scope >5 independent slices or repeated retry loops.

## Role Pattern

Default role pattern:

1. Lead agent:
   - owns plan lifecycle, route selection, integration, and final decision.
2. Explorer agents:
   - gather scoped evidence (code paths, dependencies, risks) only.
3. Worker agents:
   - implement isolated slices with explicit file ownership boundaries.
4. Reviewer/check agent:
   - validates acceptance evidence and reports findings-first.

## Ownership & Conflict Rules

Collisions are blocked by explicit file map:

- One file should have one owner per slice.
- Cross-file links are allowed only in review notes, not direct edits.
- If two workers need the same file, merge at least one of them to reviewer scope and execute serially.

## Reviewer Conflict Gate (Conflict-Heavy Sessions)

Use this gate when any slice touches nearby logic, shared tests, shared docs, or shared data contracts.

### Severity Classes

1. **Low**
   - Adjacent lines in different files, no shared state or API contract.
   - Reviewer validates scope consistency only.
2. **Medium**
   - Same file different regions, or cross-file refactor with clear boundaries.
   - Reviewer validates each patch and merge order.
3. **High**
   - Same function/section, deletion/rewrite conflicts, or contradictory behavior assumptions.
   - Reviewer must resolve patch semantics before merge and record decision.

### Mandatory Conflict Record

When conflict exists, append one record with this shape in plan WIP notes:

```text
- conflict-log [HH:MM:SS] Severity: <Low|Medium|High>
  files: [a.md, b.ts]
  conflict: <short summary>
  reviewer: <name/role>
  decision: <rejected|kept|rewritten>
  rationale: <one line reason>
  recovery: <follow-up task if needed>
```

Reviewer duty:

- compare both patch variants against task acceptance criteria,
- choose final shape,
- add a follow-up task if needed.

If a High conflict is not deterministically resolvable in one pass, set `orchestrator_mode: required` and return to `single` for affected files.

Output contract per role:

- Explorer -> `[scope, risks, evidence, next_questions]`
- Worker -> `[files_changed, rationale, checks_run, blockers]`
- Reviewer -> `[acceptance_passed, check_evidence, blockers, patch_conflicts]`

## Orchestration Loop

1. Lead resolves active plan and chooses one route.
2. Lead validates `Parallelization Gate` and assigns ownership map.
3. Lead identifies the 5-phase path (`full` or `fast`) and records it in WIP.
4. Lead spawns parallel explorers/workers for independent slices (Split/Execute phases).
5. Lead waits for results, integrates outputs, and resolves conflicts (Merge phase).
6. Lead runs/collects check evidence and decides `PASS|BLOCK` (Close phase).
7. Lead mutates plan state and reports compact `State/Doing/Next`.

Suggested default for this lifecycle:

1. Assess: collect acceptance boundaries and route risk.
2. Split: write `agent_slices` and max parallel count.
3. Execute: collect all worker outputs.
4. Merge: apply one deterministic conflict policy.
5. Close: run checks, update plan, set next action.

## Safe Runtime Settings

- `orchestrator_mode`: `none|optional|required` (persist in plan metadata as needed)
- `agent_slices`: explicit mapping of role → file owners
- `max_parallel_workers`: default `3` for UI + CLI changes, override only when each slice is low-risk

Recommended defaults:

- `orchestrator_mode`: `optional`
- `agent_slices`: JSON-like map `[{role, files, deliverables}]`
- `max_parallel_workers`: `2` for risky edits, `3` for low-risk UI/CLI changes, `4` only when merge risk is low.

Fallback rule:

- If any worker returns conflicting edits, set `mode=single` for the affected file and continue with the remaining tasks serially.

## Tool Mapping

Codex tooling pattern:

- `spawn_agent`: create explorers/workers with explicit scope.
- `send_input`: route clarifications or redirects to an existing sub-agent.
- `wait`: collect completion state from one or many sub-agents.
- `close_agent`: close completed agents to keep orchestration clean.

## Guardrails

- Keep one route per response even when sub-agents run in parallel.
- Require explicit ownership per worker to reduce merge collisions.
- Do not skip evidence gate: unresolved claims must be marked `Unknown`.
- Keep observer-first behavior for KFC Plan; avoid unsafe mutation controls.
- If orchestration fails, fall back to single-agent deterministic slice.

## Minimal Execution Template

1. `Lead`: resolve active plan and define slice boundaries.
2. `Explorers`: gather evidence for each slice.
3. `Workers`: implement slice A/B/C in parallel.
4. `Reviewer`: run acceptance checks and report findings.
5. `Lead`: integrate, update plan, return `State/Doing/Next`.

## Reference Snapshot

Use this checklist before running any multi-agent session:

- plan exists and matches route scope,
- ownership map is present,
- conflict guardrails are written in WIP notes,
- reviewer check criteria are explicit,
- recovery fallback (`reroute=single`) is defined in the plan.

