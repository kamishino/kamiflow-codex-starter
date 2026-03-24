# Plan

Use this route as the full implementation-planning lane when the request is clear enough to specify implementation details, acceptance criteria, and validation commands. Client repos are the default target; the kamiflow-core source repo is the source-repo exception.

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
- If the request is still missing a chosen approach, explicit scope in/out, or success checks, reroute to `start` or `research`.
- If the user is explicitly asking for implementation now and the plan is already decision-complete, reroute to `build` or `fix`.

## Steps

1. Resolve or create the active plan.
2. Read `AGENTS.md`, then `.local/project.md`, and identify the relevant priority, guardrail, open question, or recent decision.
3. If prior similar slices or durable decisions could change the plan, query `node .agents/skills/kamiflow-core/scripts/plan-history.mjs --project . --query "<text>"` and use the retrieved context as advisory evidence only.
4. If the active plan came from `start`, promote that persisted plan-lite record into the full-plan contract instead of discarding it. Keep the useful shaping context, then replace the build-ready sections with concrete implementation content.
5. Replace placeholders with a concrete goal, scope, constraints, `Project Fit`, tasks, acceptance criteria, and validation commands.
6. Keep `Project Fit` short: tie the slice to at least one priority or guardrail from `.local/project.md` instead of copying the whole brief.
7. If `AGENTS.md` enables `SemVer Workflow`, add or repair `## Release Impact`, keep it aligned with the likely release impact for the slice, and plan for a later release-only closeout step rather than turning the functionality commit into the release commit.
8. Close high-impact open decisions before handing off to implementation.
9. Remove placeholder plan filler before handoff. `ready-check.mjs` now blocks placeholder `Goal`, `Project Fit`, `Implementation Tasks`, `Acceptance Criteria`, and `Validation Commands` content.
10. Keep `Project Fit` concrete: reference at least one real priority or guardrail from `.local/project.md`, not template filler.
11. Set frontmatter for build handoff: `decision: GO`, `next_command: build`, `next_mode: Build`.
12. Persist updated `WIP Log` lines before the final response.

## Minimum Plan Mutation

- Set `lifecycle_phase: plan`.
- Keep `selected_mode: Plan`.
- If the plan started in `start`, preserve the useful `Start Summary` context but complete the full-plan sections before build handoff.
- Add a short `Project Fit` section that names at least one relevant priority or guardrail from `.local/project.md`.
- In SemVer-enabled repos, keep `## Release Impact` present even if the exact impact will be finalized during `check`.
- Replace placeholder content in `Goal`, `Project Fit`, `Implementation Tasks`, `Acceptance Criteria`, and `Validation Commands` before handing off to `build`.
- Set `decision: GO`, `next_command: build`, and `next_mode: Build` only when the plan is decision-complete.
- If unresolved high-impact decisions remain, keep the plan active and reroute to `start` or `research` instead of pretending it is build-ready.

## Command Recipe

- Recover the active plan with `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .` when needed.
- Optionally use `plan-history.mjs` when relevant archived slices or project-memory matches can improve the plan.
- Use `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .` as the final build-handoff gate once the plan text is concrete.
- Keep direct plan-file mutation as the primary planning mechanism.

## Output Contract

Use `../assets/plan-spec.md` as the full-plan shape reference after any `start`-lane promotion. The plan must be decision complete, aligned with `.local/project.md`, and ready for one scoped `build` slice.
