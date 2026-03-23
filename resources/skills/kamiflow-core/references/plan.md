# Plan

Use this route when the request is clear enough to specify implementation details and acceptance criteria.

## Trigger Cues

- plan
- spec
- design
- architecture
- break down
- scope
- acceptance criteria

## Entry Gate

- Required mode: `Plan`.
- Read `AGENTS.md` first so the plan respects repo rules before shaping the implementation slice.
- If the request is still ambiguous, reroute to `start` or `research`.
- If the user is explicitly asking for implementation now and the plan is already decision-complete, reroute to `build` or `fix`.

## Steps

1. Resolve or create the active plan.
2. Read `AGENTS.md`, then `.local/project.md`, and identify the relevant priority, guardrail, open question, or recent decision.
3. Replace placeholders with a concrete goal, scope, constraints, `Project Fit`, tasks, acceptance criteria, and validation commands.
4. Keep `Project Fit` short: tie the slice to at least one priority or guardrail from `.local/project.md` instead of copying the whole brief.
5. Close high-impact open decisions before handing off to implementation.
6. Set frontmatter for build handoff: `decision: GO`, `next_command: build`, `next_mode: Build`.
7. Persist updated `WIP Log` lines before the final response.

## Minimum Plan Mutation

- Set `lifecycle_phase: plan`.
- Keep `selected_mode: Plan`.
- Add a short `Project Fit` section that names at least one relevant priority or guardrail from `.local/project.md`.
- Set `decision: GO`, `next_command: build`, and `next_mode: Build` only when the plan is decision-complete.
- If unresolved high-impact decisions remain, keep the plan active and reroute to `start` or `research` instead of pretending it is build-ready.

## Command Recipe

- Recover the active plan with `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .` when needed.
- Keep direct plan-file mutation as the primary planning mechanism.

## Output Contract

Use `../assets/plan-spec.md` as the shape reference. The plan must be decision complete, aligned with `.local/project.md`, and ready for one scoped `build` slice.
