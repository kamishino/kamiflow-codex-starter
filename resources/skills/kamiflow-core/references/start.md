# Start

Use this route as the persisted plan-lite lane when the request is bounded but still unclear, early-stage, or explicitly asks to brainstorm or shape an idea before full planning. Client repos are the default target; the kamiflow-core source repo is the source-repo exception.

## Trigger Cues

- brainstorm
- idea
- explore options
- choose a direction
- unclear request
- early product thinking
- bounded implementation idea with missing scope or success checks

## Entry Gate

- Required mode: `Plan`.
- Typical alias: `start (brainstorm)` or `start (idea exploration)`.
- Read `AGENTS.md` first to pick up repo rules before shaping the idea.
- If the request is actually asking for facts or comparisons, reroute to `research`.
- If the request is already concrete enough for `Implementation Tasks`, `Acceptance Criteria`, and `Validation Commands`, reroute to `plan`.

## Steps

1. Ask only the smallest set of clarification questions needed to remove high-impact ambiguity.
2. Read `AGENTS.md`, then `.local/project.md`, and summarize the problem against current priorities, guardrails, and open questions.
3. If prior similar slices could materially reduce ambiguity, query `node .agents/skills/kamiflow-core/scripts/plan-history.mjs --project . --query "<text>"` and use the results as advisory context only.
4. Update the active plan with the lightweight shaping fields needed to make the idea concrete: `Start Summary`, `Goal`, `Scope (In/Out)`, `Constraints`, `Project Fit`, and `Open Decisions`.
5. Compare a small set of options only when real tradeoffs remain. Do not force a three-option format when one direction is already clearly best.
6. Recommend the best next implementation slice, explain why, and hand off to `plan` rather than pretending the work is build-ready.
7. Update `.local/project.md` only if the idea work changes priorities, open questions, guardrails, or a durable decision.

## Minimum Plan Mutation

- Set `lifecycle_phase: start`.
- Keep `selected_mode: Plan`.
- Fill `Start Summary`, `Goal`, `Scope (In/Out)`, `Constraints`, `Project Fit`, and `Open Decisions` with concrete shaping notes.
- Set `next_command: plan` and `next_mode: Plan`.
- Do not set `decision: GO`, `next_command: build`, or `next_mode: Build`.
- Append `WIP Log` lines that capture the brainstorm or idea route and the next planning step.

## Command Recipe

- If no active plan exists, run `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`.
- Optionally use `plan-history.mjs` when a prior similar slice could sharpen the direction quickly.
- Prefer direct markdown updates after plan recovery.

## Output Contract

Use the structure in `../assets/start-report.md` when it helps. Report the selected route as `start (brainstorm)` or `start (idea exploration)` when applicable. Tie the recommendation to `.local/project.md` when relevant and end with one exact next command, normally `plan`.
