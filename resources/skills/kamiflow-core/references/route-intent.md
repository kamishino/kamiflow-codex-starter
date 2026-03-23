# Route Intent

Use this file as the routing authority for daily prompts.

## Responsibility Order

1. Read `AGENTS.md` to understand repo rules and operating behavior.
2. Read `.local/project.md` to understand product priorities, guardrails, open questions, and recent decisions.
3. Read the active non-done plan to understand the current execution slice.

This responsibility order does not replace route inference. It defines which local artifacts own which kind of context.

## Decision Order

1. Check for explicit intent aliases in the user's request.
2. If no explicit alias is present, use the active non-done plan's `next_command` or `lifecycle_phase` as the route hint.
3. Read `.local/project.md` and use it to bias route framing and tradeoffs.
4. Apply safety overrides before doing work:
   - `build` and `fix` require `ready-check.mjs` to pass
   - `check` requires validation evidence before claiming `PASS`
5. If no stronger route is selected and the task is simple operational work, use the fast path instead of plan-heavy routing.
6. If no route is still obvious, use fallback routing:
   - fuzzy request -> `start`
   - clear but under-specified implementation request -> `plan`

## Intent Aliases

- `start`
  - brainstorm, idea, explore, options, direction, unclear, choose approach
- `plan`
  - plan, spec, design, architecture, break down, scope, acceptance criteria
- `build`
  - implement, add, create, build, scaffold, wire up
- `fix`
  - fix, bug, broken, failing, regression, error, repair
- `check`
  - review, verify, validate, test, QA, done, close out
- `research`
  - investigate, compare, evaluate, root cause, why, analyze

Keep `start` as the internal route token. When the request says `brainstorm` or `idea`, report it as `Selected Route: start (brainstorm)` or `Selected Route: start (idea exploration)`.

## Active Plan Hints

- Prefer the explicit user alias over stale plan momentum.
- When the user does not specify a route, use `next_command` first.
- If `next_command` is missing, fall back to `lifecycle_phase`.
- If the active plan is draft or decision-incomplete, bias toward `start`, `plan`, or `research` instead of `build` or `fix`.

## Project Brief Hints

- Use `Current Priorities` to decide whether the request is aligned, premature, or missing important context.
- Use `Architecture Guardrails` to constrain plans before implementation starts.
- Use `Open Questions` to detect when `research` or `start` is safer than `plan`.
- Use `Recent Decisions` to avoid contradicting prior choices or re-litigating settled direction.

## Safety Overrides

- If provisional route is `build` or `fix` and `ready-check.mjs` fails:
  - stop implementation
  - make zero implementation edits
  - continue only as `plan` work in that response
- If provisional route is `check` and evidence is missing:
  - do not claim `PASS`
  - return `BLOCK`, or reroute to `research` or `plan` if facts are missing

## Fast Path

Use the fast path only when there is no stronger explicit route and no risky active-plan state.

Allowed fast-path categories:
- explain or summarize the current state
- status, diff, or log inspection
- narrow read-only checks
- commit or commit-message chores
- small operational follow-ups that do not need acceptance criteria or lifecycle tracking

Do not use the fast path for feature work, bug fixing, closeout, or any request that needs acceptance criteria, validation, or plan continuity.
