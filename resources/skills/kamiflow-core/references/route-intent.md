# Route Intent

Use this file as the routing authority for daily prompts.

Client repos are the default workflow target. Treat the kamiflow-core source repo as the source-repo exception and keep maintainer-only context explicit whenever you are in it.

## Responsibility Order

1. Read `AGENTS.md` to understand repo rules, operating behavior, and any optional release policy.
2. Read `.local/project.md` to understand product priorities, guardrails, open questions, and recent decisions.
3. Read the active non-done plan to understand the current execution slice.

This responsibility order does not replace route inference. It defines which local artifacts own which kind of context. Treat `.local/project.md` as curated durable memory, not task history.

## Decision Order

1. Check for explicit intent aliases in the user's request.
2. Before leaning on active-plan hints, check whether the request is a narrow operational ask that can stay on the fast path even with an active plan. Treat status, diff, summary, commit, release, and finish chores as operational unless the user is actually asking for new implementation, bug fixing, or validation closeout.
3. If no stronger explicit user intent is present, use the active non-done plan's `next_command` or `lifecycle_phase` as the route hint.
4. Read `.local/project.md` and use it to bias route framing and tradeoffs, especially whether the workspace is a client repo or the kamiflow-core source repo.
5. Apply safety overrides before doing work:
   - `build` and `fix` require `ready-check.mjs` to pass
   - `check` requires validation evidence before claiming `PASS`
6. If no stronger route is selected and the task is simple operational work, use the fast path instead of plan-heavy routing.
7. If no route is still obvious, use fallback routing:
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

For SemVer-enabled repos, treat `commit please`, `release please`, and `finish please` as fast-path closeout requests. Before acting on any of them, inspect `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .` and follow its `recommended_action`.

## Active Plan Hints

- Prefer the explicit user alias over stale plan momentum.
- Treat `next_command` and `lifecycle_phase` as hints, not hard steering.
- Do not let stale `build`, `fix`, or `check` momentum override explicit narrow operational asks.
- When the user does not specify a route, use `next_command` first.
- If `next_command` is missing, fall back to `lifecycle_phase`.
- If the active plan is draft or decision-incomplete, bias toward `start`, `plan`, or `research` instead of `build` or `fix`.

## Operational Override Examples

- Ignore stale active-plan momentum when the user asks for:
  - current status or a short summary
  - a diff, log, or read-only inspection
  - `commit please`
  - `release please`
  - `finish please`
- Respect the active plan and normal route flow when the user asks for:
  - implementation of the next slice
  - a concrete bug fix
  - readiness-gated build or repair work
  - validation closeout or PASS/BLOCK evidence

## Project Brief Hints

- Use `Current Priorities` to decide whether the request is aligned, premature, or missing important context.
- Use `Architecture Guardrails` to constrain plans before implementation starts.
- Use `Open Questions` to detect when `research` or `start` is safer than `plan`, especially for unresolved recurring concerns.
- Use `Recent Decisions` to avoid contradicting prior choices or re-litigating settled direction.
- Express anti-patterns through the existing sections: repeatable constraints as guardrails, settled conclusions as decisions, unresolved concerns as open questions.

## Safety Overrides

- If provisional route is `build` or `fix` and `ready-check.mjs` fails:
  - stop implementation
  - make zero implementation edits
  - continue only as `plan` work in that response
- If provisional route is `check` and evidence is missing:
  - do not claim `PASS`
  - return `BLOCK`, or reroute to `research` or `plan` if facts are missing

## Fast Path

Use the fast path when the ask is narrow operational work and does not require new acceptance criteria, implementation edits, or validation closeout, even if an active plan exists.

Allowed fast-path categories:
- explain or summarize the current state
- status, diff, or log inspection
- narrow read-only checks
- commit or commit-message chores
- release or finish chores that first consult `finish-status.mjs`
- small operational follow-ups that do not need acceptance criteria or lifecycle tracking

Do not use the fast path for feature work, bug fixing, closeout, or any request that needs acceptance criteria, validation, or plan continuity.
