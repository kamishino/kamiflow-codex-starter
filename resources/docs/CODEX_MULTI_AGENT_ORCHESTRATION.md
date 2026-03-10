# Codex Multi-Agent Orchestration

Use this guide when one request is too broad for a single linear execution slice.

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

Output contract per role:

- Explorer -> `[scope, risks, evidence, next_questions]`
- Worker -> `[files_changed, rationale, checks_run, blockers]`
- Reviewer -> `[acceptance_passed, check_evidence, blockers, patch_conflicts]`

## Orchestration Loop

1. Lead resolves active plan and chooses one route.
2. Lead validates `Parallelization Gate` and assigns ownership map.
3. Lead spawns parallel explorers/workers for independent slices.
4. Lead waits for results, integrates outputs, and resolves conflicts.
5. Lead runs/collects check evidence and decides `PASS|BLOCK`.
6. Lead mutates plan state and reports compact `State/Doing/Next`.

## Safe Runtime Settings

- `orchestrator_mode`: `none|optional|required` (persist in plan metadata as needed)
- `agent_slices`: explicit mapping of role → file owners
- `max_parallel_workers`: default `3` for UI + CLI changes, override only when each slice is low-risk

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

