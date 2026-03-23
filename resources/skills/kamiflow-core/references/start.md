# Start

Use this route when the request is fuzzy, early-stage, or explicitly asks to brainstorm or shape an idea before planning. Client repos are the default target; the kamiflow-core source repo is the source-repo exception.

## Trigger Cues

- brainstorm
- idea
- explore options
- choose a direction
- unclear request
- early product thinking

## Entry Gate

- Required mode: `Plan`.
- Typical alias: `start (brainstorm)` or `start (idea exploration)`.
- Read `AGENTS.md` first to pick up repo rules before shaping the idea.
- If the request is actually asking for facts or comparisons, reroute to `research`.
- If the request is already concrete enough for scope, tasks, and acceptance criteria, reroute to `plan`.

## Steps

1. Ask only the smallest set of clarification questions needed to remove high-impact ambiguity.
2. Read `AGENTS.md`, then `.local/project.md`, and summarize the problem against current priorities, guardrails, and open questions.
3. Produce exactly three options: `Quick Win`, `Balanced`, and `Ambitious`.
4. Recommend one best option and explain the tradeoff.
5. Update the active plan with a `Start Summary` and the next command.
6. Update `.local/project.md` only if the idea work changes priorities, open questions, or a durable decision.

## Minimum Plan Mutation

- Set `lifecycle_phase: start`.
- Keep `selected_mode: Plan`.
- Set `next_command: plan` and `next_mode: Plan`.
- Append `WIP Log` lines that capture the brainstorm or idea route and the next planning step.

## Command Recipe

- If no active plan exists, run `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`.
- Prefer direct markdown updates after plan recovery.

## Output Contract

Use the structure in `../assets/start-report.md` when it helps. Report the selected route as `start (brainstorm)` or `start (idea exploration)` when applicable. Tie the recommendation to `.local/project.md` when relevant and end with one exact next command, normally `plan`.
