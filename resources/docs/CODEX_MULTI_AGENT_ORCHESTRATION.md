# Codex Multi-Agent Orchestration

Use this guide when one request is too broad for a single linear execution slice.

## When To Use Multi-Agent

Use multi-agent orchestration when:

- work can be split into independent file ownership slices.
- research, implementation, and validation can run in parallel.
- a single-agent pass would create high context switching overhead.

Avoid multi-agent mode when:

- task is small and can be finished safely by one agent.
- edits are tightly coupled in the same file region.
- merge risk is higher than expected parallel speedup.

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

## Orchestration Loop

1. Lead resolves active plan and chooses one route.
2. Lead spawns parallel explorers/workers for independent slices.
3. Lead waits for results, integrates outputs, and resolves conflicts.
4. Lead runs/collects check evidence and decides `PASS|BLOCK`.
5. Lead mutates plan state and reports compact `State/Doing/Next`.

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

