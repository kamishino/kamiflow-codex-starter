---
name: kamiflow-core
description: Route daily Codex work through a clarity-first, client-repo-first workflow with a repo contract in `AGENTS.md`, human project memory in `.local/project.md`, and helper-backed task plans under `.local/plans/`. Use when Codex needs to infer the lightest safe lane from prompts like brainstorm, idea, plan, implement, fix, review, verify, or investigate; shape unclear work before implementation; write a decision-complete plan; implement in scoped slices; verify with evidence; recover plan state inside any client repo; or honor an optional SemVer release policy in `AGENTS.md` for opted-in Node/npm repos. Treat the kamiflow-core source repo as the source-repo exception.
---

# Kami Flow Core

Use this skill for client-repo work first. The kamiflow-core source repo is the source-repo exception and keeps the source-only forward-test bundle plus maintainer checks. It needs clarity-first route inference, one human-facing project brief, active plan continuity, evidence-backed closeout, and optional SemVer release control for repos that opt in through `AGENTS.md`.

## Quick Start

1. For any non-fast-path task, read `AGENTS.md`, `.local/project.md`, `references/route-intent.md`, and `references/command-map.md`. If the workspace is a client repo, treat the client brief as the default; if it is the kamiflow-core source repo, use the source-repo brief and maintainer-only context. If `AGENTS.md` enables `SemVer Workflow`, treat release impact as part of closeout and use `finish-status.mjs` before acting on commit, release, or finish requests.
2. Treat `AGENTS.md` as the repo operating contract, `.local/project.md` as human project memory, and `.local/plans/*.md` as task execution state.
3. If `.local/plans/` has no active non-done plan or `.local/project.md` is missing, run `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`.
4. Infer the route automatically from explicit intent, the three internal lanes, active plan state, `.local/project.md`, and safety gates. Treat active-plan `next_command` and `lifecycle_phase` as hints only.
5. For `start`, `plan`, or `research`, optionally query `node .agents/skills/kamiflow-core/scripts/plan-history.mjs --project . --query "<text>"` when similar prior slices or durable project memory could materially improve the answer. Keep retrieval bounded and advisory only.
6. Only load the matching route reference after the route is inferred.
7. For narrow operational work like status, diff, summary, commit, release, finish, or `open plan view`, prefer the fast path instead of forcing stale active-plan momentum back into heavier planning flow.
8. Before `build` or `fix`, first make sure the active plan is already a decision-complete implementation or repair slice. If it is still draft or placeholder, do not continue implementation in that response; reroute to `plan`, update the plan, and stop. Run `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .` only on a later `build` or `fix` attempt after the plan is ready.
9. Mutate the active plan markdown before the final response whenever the task is not on the fast path. Update `.local/project.md` only when priorities, guardrails, open questions, or durable decisions changed. Express recurring anti-patterns as `Architecture Guardrails`, settled evidence-backed conclusions as `Recent Decisions`, and unresolved recurring concerns as `Open Questions`.
10. State only evidence-backed claims. If evidence is missing, say `Unknown` and reroute.

## Local Helpers

- `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`
  - create or recover one active non-done plan, repair `.local/project.md`, and recreate a missing client `AGENTS.md` only when the repo contract is absent
- `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .`
  - verify whether the active plan is ready for `build` or `fix`
- `node .agents/skills/kamiflow-core/scripts/archive-plan.mjs --project . --plan <path>`
  - archive a completed PASS plan and roll older done plans into weekly buckets like `.local/plans/done/2026/W13/`
- `node .agents/skills/kamiflow-core/scripts/cleanup-plans.mjs --project .`
  - report stale active plans, orphan plan conditions, and done-plan distribution without mutating plan files
- `node .agents/skills/kamiflow-core/scripts/plan-history.mjs --project . --query "<text>"`
  - retrieve bounded prior context from `.local/project.md`, the active plan, and recent archived PASS plans when `start`, `plan`, or `research` would benefit from similar prior slices
- `node .agents/skills/kamiflow-core/scripts/plan-snapshot.mjs --project . --format text|markdown|json`
  - derive one compact active-plan snapshot for terminal summaries, markdown status cards, or JSON consumers
- `node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --open`
  - open or reuse the lightweight localhost plan view for the current repo
- `node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --stop`
  - stop the current repo-local plan-view server and clear stale runtime state
- `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .`
  - inspect repo state and recommend `commit-only`, `release-only`, or `commit-and-release` before acting on finish requests
- `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .`
  - for opted-in single-package Node/npm repos, run the release-only closeout step after the functional commit, aggregate unreleased PASS-plan impact since the latest reachable release tag, update version files, and print guided release commit plus tag commands

Use direct markdown mutation as the primary workflow. Use the helper scripts only for deterministic bootstrap, readiness, and archive recovery.

## Clarity-First Lanes

- `fast path`
  - use for clear, low-risk, narrow operational asks that do not need new acceptance criteria, implementation work, or validation closeout
- `start`
  - the persisted plan-lite lane for bounded but unclear work that still needs a chosen approach, clearer scope, explicit non-goals, or success checks before implementation planning
- `plan`
  - the full implementation-planning lane that defines `Implementation Tasks`, `Acceptance Criteria`, `Validation Commands`, and `Release Impact` when enabled, then hands off to `build`

Keep the public route surface unchanged. `start` is the internal plan-lite lane; `plan` is the build-ready planning lane. `build` and `fix` still require the existing `ready-check.mjs` boundary before implementation.

## Three-Layer Contract

- `AGENTS.md`
  - repo rules, operating behavior, optional SemVer release policy, and the local artifacts Codex must read first
- `.local/project.md`
  - human-facing product memory for priorities, guardrails, open questions, and durable decisions
- `.local/plans/*.md`
  - task execution state for the current implementation slice
- `.local/plans/done/**/*.md`
  - archived PASS plans, with the newest 20 kept flat in `.local/plans/done/` and older ones rolled into weekly buckets like `2026/W13/`

Keep the ownership one-way: plans may reference `.local/project.md` through `Project Fit`, and `.local/project.md` may absorb durable guardrails, decisions, or unresolved recurring concerns from completed work, but `.local/project.md` does not rewrite `AGENTS.md`, does not become an automatic log, and plans do not duplicate the full project brief.

## Project Memory

- Keep long-lived project memory in `.local/project.md`.
- Treat `.local/project.md` as human-facing context, not machine-only metadata, task history, or an automatic log.
- Use it to remember product direction, current priorities, architecture guardrails, open questions, and durable decisions across sessions.
- Put recurring future constraints in `Architecture Guardrails`.
- Put settled evidence-backed conclusions in `Recent Decisions`.
- Put unresolved recurring risks or lessons that still need evidence in `Open Questions`.
- Treat `check` as the primary promotion point for durable project-memory updates after implementation or research.
- Do not create extra namespaced local state unless a future machine-only need appears.
- Use `cleanup-plans.mjs` when plan hygiene is unclear instead of guessing whether old active plans are stale, orphaned, or safe to ignore.

## Route Selector

- `start`: persist lightweight idea shaping for bounded but unclear work before full planning.
- `plan`: produce a decision-complete implementation plan that is ready to hand off to `build`.
- `build`: implement one approved slice.
- `check`: verify behavior and decide `PASS` or `BLOCK`.
- `research`: gather missing facts or compare risky options.
- `fix`: repair a concrete bug or regression.

Use `references/route-intent.md` as the routing authority. Keep `start` as the canonical internal token; report `brainstorm` and `idea` as aliases, for example `Selected Route: start (brainstorm)`.

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

## References

- `references/route-intent.md`: route inference order, aliases, safety overrides, and fast-path rules.
- `references/command-map.md`: install, recovery, local-state ownership, and route-selection commands.
- `references/start.md`
- `references/plan.md`
- `references/build.md`
- `references/check.md`
- `references/research.md`
- `references/fix.md`
- `assets/*.md`: lightweight output skeletons and runtime templates to reuse when they help.

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
