# Research

Use this route when facts are missing, risk is high, or the user needs a recommendation grounded in evidence. Client repos are the default target; the kamiflow-core source repo is the source-repo exception.

## Trigger Cues

- investigate
- compare
- evaluate
- root cause
- why
- analyze

## Entry Gate

- Required mode: `Plan`.
- Read `AGENTS.md` first, then `.local/project.md`, so the research respects repo rules and the current product context.
- If the request is actually implementation-ready, reroute to `plan` or `build`.
- If the user is asking for idea-shaping rather than facts, reroute to `start`.

## Steps

1. Read `AGENTS.md`, then `.local/project.md`, and identify which open question, priority, or guardrail makes the research necessary.
2. Gather the minimum facts needed to answer the open question.
3. Separate confirmed evidence from inference.
4. Compare realistic options or identify the most likely root cause.
5. End with a concrete recommendation and next route.
6. Persist the research outcome in the active plan before the final response.
7. Update `.local/project.md` only when the research resolves an open question, creates a durable decision, or confirms a repeatable guardrail. Otherwise keep the finding in the plan until `check` closes it out.

## Minimum Plan Mutation

- Set `lifecycle_phase: research`.
- Keep `selected_mode: Plan`.
- Set one concrete `next_command` at the end, typically `start`, `plan`, or `fix`.
- Append `WIP Log` lines that separate evidence from inference.

## Command Recipe

- If no active plan exists, recover it with `ensure-plan.mjs`.
- Keep the final recommendation tied to one next route: `start`, `plan`, or `fix`.

## Output Contract

Return concise `State`, `Doing`, and `Next` sections with evidence-backed conclusions only.
