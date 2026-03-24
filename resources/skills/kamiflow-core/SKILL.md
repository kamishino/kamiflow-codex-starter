---
name: kamiflow-core
description: Route daily Codex work through a clarity-first, client-repo-first workflow with a repo contract in `AGENTS.md`, human project memory in `.local/project.md`, and helper-backed task plans under `.local/plans/`. Use when Codex needs to infer the lightest safe lane from prompts like brainstorm, idea, plan, implement, fix, review, verify, or investigate; shape unclear work before implementation; write a decision-complete plan; implement in scoped slices; verify with evidence; recover plan state inside any client repo; or honor an optional SemVer release policy in `AGENTS.md` for opted-in Node/npm repos. Treat the kamiflow-core source repo as the source-repo exception.
---

# Kami Flow Core

Use this skill for client-repo work first. The kamiflow-core source repo is the source-repo exception and keeps the source-only forward-test bundle plus maintainer checks.

## Quick Start

For ordinary client-repo work, keep the default loop small:

1. Read `AGENTS.md` and `.local/project.md`.
2. Reuse the active plan, or recover one with `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .` if the plan or project brief is missing.
3. Infer the route from user intent and the current plan state, then load only the matching route reference.
4. Before `build` or `fix`, use `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .` only when you need a deterministic build-ready GO/BLOCK answer.
5. When explicitly closing a slice, prefer `node .agents/skills/kamiflow-core/scripts/check-closeout.mjs --project .` over manually chaining validation and archive steps.
6. Keep non-trivial work grounded in plan markdown, and update `.local/project.md` only when durable priorities, guardrails, open questions, or decisions changed.

Everything else is advanced or condition-triggered. Keep the default client path centered on one active plan plus the minimum helper set.

## Mental Model

- `AGENTS.md`
  - repo rules, operating behavior, optional SemVer release policy, and the local artifacts Codex must read first
- `.local/project.md`
  - human-facing product memory for priorities, guardrails, open questions, and durable decisions
- `.local/plans/*.md`
  - task execution state for the current implementation slice
- `.local/plans/done/**/*.md`
  - archived PASS plans, with the newest 20 kept flat in `.local/plans/done/` and older ones rolled into weekly buckets like `2026/W13/`

Keep the ownership one-way: plans may reference `.local/project.md` through `Project Fit`, and `.local/project.md` may absorb durable guardrails, decisions, or unresolved recurring concerns from completed work, but `.local/project.md` does not rewrite `AGENTS.md`, does not become an automatic log, and plans do not duplicate the full project brief.

## Core Workflow

- `fast path`
  - use for clear, low-risk, narrow operational asks that do not need new acceptance criteria, implementation work, or validation closeout
- `start`
  - use for bounded but unclear work that still needs a chosen approach, clearer scope, explicit non-goals, or success checks before full planning
- `plan`
  - use for full implementation planning that defines `Implementation Tasks`, `Acceptance Criteria`, `Validation Commands`, and `Release Impact` when enabled, then hands off to `build`
- `build`
  - implement one approved slice
- `check`
  - verify behavior and decide `PASS` or `BLOCK`
- `research`
  - gather missing facts or compare risky options
- `fix`
  - repair a concrete bug or regression

Use `references/route-intent.md` as the routing authority. Keep `start` as the canonical internal token; report `brainstorm` and `idea` as aliases, for example `Selected Route: start (brainstorm)`.

Before `build` or `fix`, the active plan must already be decision-complete. If it is still draft or placeholder, reroute to `plan`, update the plan, and stop. A failing `ready-check.mjs` is a hard stop for implementation in that response.

## Helper Buckets

Keep exact commands, arguments, and recovery shortcuts in `references/command-map.md`. Do not duplicate the full command catalog here.

- `core daily use`
  - `ensure-plan`, `ready-check`, `check-closeout`
- `advanced recovery`
  - `archive-plan`, `cleanup-plans`, `plan-history`, `plan-snapshot`, `plan-view.mjs`
- `release and maintainer`
  - `finish-status`, `version-closeout`

Use direct markdown mutation as the primary workflow. Keep the ordinary client path centered on the core daily-use helpers and reach for advanced helpers only when the situation explicitly calls for them.

## Advanced Helpers

These helpers stay available, but they are not part of the default client-repo loop:

- use `plan-history.mjs` only when prior similar slices would materially improve `start`, `plan`, or `research`
- use `cleanup-plans.mjs` only when active-plan state feels stale or conflicting
- use `finish-status.mjs` and `version-closeout.mjs` only when the user is finishing or releasing work in a SemVer-enabled repo
- use `plan-view.mjs` only when the user explicitly asks for a live read-only plan screen

## Output Contract

For non-trivial route responses, keep the final answer compact:

- `State`
- `Doing`
- `Next`

`build`, `fix`, and `check` must also report a literal `Check: PASS` or `Check: BLOCK` line with concrete evidence. Do not wrap `PASS` or `BLOCK` in backticks or other formatting.

## Plan Contract

- Keep one active non-done plan by default in `.local/plans/`.
- Reuse the active plan unless the scope is explicitly split.
- Update plan frontmatter and add timestamped `WIP Log` lines before the final response.
- Keep a short `Project Fit` section tied to `.local/project.md` instead of copying the whole brief into the plan.
- When `SemVer Workflow` is enabled in `AGENTS.md`, keep a `## Release Impact` section in the plan and resolve it before PASS archive.
- Keep functional commit history and release history separate in SemVer-enabled repos.
- In SemVer-enabled repos, release level comes from the highest unresolved `Release Impact` across PASS plans since the latest reachable `vX.Y.Z` tag.
- In SemVer-enabled repos, interpret `commit please` as functional commit only, `release please` as release closeout only, and `finish please` as a request to choose the correct end-of-slice action from `finish-status.mjs`.
- Keep explicit narrow operational asks lightweight even when an active plan exists. Do not reroute `commit please`, `release please`, `finish please`, `open plan view`, status, diff, or summary requests into `plan`, `build`, or `check` unless the user is actually asking for implementation or closeout work.
- Keep `plan-snapshot.mjs` as the canonical read model for both status summaries and the optional live plan view. The live view must stay read-only and must not parse plan files independently.
- Treat `start` as the persisted plan-lite handoff into `plan`, not as a shortcut around the full-plan contract.
- Archive only after all Acceptance Criteria and Go/No-Go items are checked.

## Design Rubric

Judge every future helper or feature against this product bar before adding it.

- `single-job clarity`
  - a helper should do one obvious job, and its name should explain that job without extra interpretation
- `inspect before mutate`
  - prefer read-only helpers first; mutating helpers should be explicit, bounded, and easy to understand locally
- `client-repo-first`
  - optimize the default behavior for ordinary client repos; keep source-repo behavior as the explicit exception
- `small local state`
  - keep the contract limited to `AGENTS.md`, `.local/project.md`, `.local/plans/*.md`, and `.local/plans/done/**/*.md` unless a concrete need proves otherwise
- `evidence-backed output`
  - prefer compact, stable summaries with counts, blockers, readiness, recommendations, and paths over prose-heavy output
- `no orchestration theater`
  - do not introduce role simulation, agent-company framing, or framework-like workflow layers unless they clearly improve everyday repo work
- `portable by default`
  - avoid extra runtime stacks, OS-specific assumptions, or dashboard dependence in the baseline flow

Use this rubric as a gate for any new helper proposal:

- state the problem clearly
- explain why an existing helper is insufficient
- define the exact input/output shape
- explain why the change stays lightweight

## References

- `references/route-intent.md`: route inference order, aliases, safety overrides, and fast-path rules
- `references/command-map.md`: install, recovery, helper tiers, and route-selection commands
- `references/start.md`
- `references/plan.md`
- `references/build.md`
- `references/check.md`
- `references/research.md`
- `references/fix.md`
- `assets/*.md`: lightweight output skeletons and runtime templates to reuse when they help

## Boundaries

- Keep one route per response.
- Do not ask the user to name a route unless the ambiguity is truly high-impact; infer it from the request first.
- Do not claim completion without evidence from files, commands, or explicit user data.
- Do not treat `.local/project.md` as tracked source; it is generated runtime state in installed projects.
- Treat a failing `ready-check.mjs` as a hard stop for `build` and `fix`; zero implementation edits are allowed until the plan is ready.
- If `ready-check.mjs` fails, the rest of that response is `plan`-only work. You may update plan markdown, but do not rerun readiness and continue to implementation in the same response.
- Do not depend on repo-specific docs, hidden bootstrap files, or extra workflow tools outside this skill folder.
- Treat client repos as the default operating target; describe the kamiflow-core source repo explicitly as the source-repo exception whenever you are working here.
- Keep SemVer closeout opt-in only. Non-opted-in repos must not be forced into release-impact or version-file mutations.
- Limit SemVer file mutation to root single-package Node/npm repos in this slice.
- If the skill is missing from the project, reinstall it with `npx --package @kamishino/kamiflow-core kamiflow-core install --project .`.
