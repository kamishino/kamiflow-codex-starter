# Changelog

Decision log for durable user-visible or workflow-affecting changes.
This file is the SSOT. The root `CHANGELOG.md` is a generated mirror.

## 2026-03-19

- Expanded the KFC Plan and remote session workflow with richer runlog-aware activity surfaces: plan-web now exposes stronger activity journal metadata and copy affordances, while the hosted remote UI adds queue visibility, cancel controls, queue ETA/session status details, and more resilient live transcript/session refresh behavior.

## 2026-03-11

- Fixed several runtime logic conflicts across KFC client/plan/web surfaces: client recovery/apply commands now keep the correct target repo for out-of-tree usage, KFC Plan now uses one Start Summary placeholder gate and blocks repeated build handoff after Check, plan mutations preserve freeform non-heading prose, and package `kfc-web`/`kfc-chat` entrypoints now align with wrapper root-detection while `kfc-web` dev assets honor the browser-visible host.
- Consolidated project-root detection into `@kamishino/kfc-runtime/project-root` so root CLI commands, script runners, and `kfc-plan-web` now share one runtime SSOT instead of keeping three duplicate implementations in sync.
- Made project-root auto-detection the default for `kfc client ...` and `kfc flow ...` when `--project` is omitted, so in-project usage no longer needs `--project .` and that flag is now mainly for out-of-tree targeting.
- Added `kfc client status` as a calm read-only re-entry lane for existing client repos, summarizing repo shape, plan state, ready-brief presence, install source, and next action without triggering bootstrap or repair.
- Expanded the client-installed `AGENTS.md` shared contract so every `kfc client` repo now gets portable Kami Flow Core sections for plan lifecycle, evidence recovery, smooth-flow routing, and lightweight markdown readability guidance.
- Strengthened client-installed `AGENTS.md` so `kfc client` now injects a shared Kami Flow Core runtime contract for active-plan discipline, evidence gates, compact `State/Doing/Next` responses, blocker recovery, and docs/closeout review instead of only a thin command map.
- Added a warning-only `AGENTS.md` review lane to docs-freshness/governance so workflow-surface Codex-CLI changes now remind maintainers to review the repo operating contract without failing the run when no contract update is needed.
- Hardened `commit:codex` for restricted shells by letting the commit helper inject changed-file context into docs-freshness verification, avoiding a redundant Node-side Git spawn for that governance gate.
- Hardened `kfc web dev` startup so it auto-resolves occupied shell/Vite ports, supports bounded fallback with `--port-strategy` and `--port-scan-limit`, and now starts Vite from inline dev config so restricted shells do not need an `esbuild` config-loader spawn just to boot the web shell.
- Added chat session discovery and one-click bind for the hosted `/chat` surface: users can search `~/.codex/sessions` from the browser and bind directly without manually copying IDs.
- Added balanced-route observability for Kami Flow runs via normalized runlog events, route-guardrail summary reporting, and a new `verify:route-health` governance gate.
- Added a simple pre-brainstorm option to Kami Flow Start: explicit `simple` mode path with shorter questioning and compact START_CONTEXT handoff metadata.
- Added route-health report mode and explicit `kfc-run` telemetry normalization for `run_state` and `phase`, plus a `route-health:report` convenience script.

## 2026-03-10

- Added a docs freshness protocol so workflow-impacting changes now require tracked doc review, generated doc sync, and governance verification before commit-safe completion.
- Formalized the tracked/private split: tracked governance docs live in the repo, while project-private memory stays in `.kfc/LESSONS.md` and `.local/kfc-lessons/`.
- Improved client onboarding so truly empty folders auto-initialize a minimal `package.json`, non-Node folders block with direct recovery, and `.kfc/CODEX_READY.md` now hands Codex off according to the active plan state instead of always pushing `kfc flow ready` first.
- Added an inline client inspection contract before bootstrap mutation so `kfc client` now classifies repo shape, shows planned touches, and blocks risky mixed repos before changing files.
- Added a repo-shape portability matrix runner plus route/runbook updates so client proof, inspection-aware handoff, and hosted product hierarchy are documented as one coherent workflow.
- Added client-root `AGENTS.md` generation with a managed KFC contract block so fresh client repos now have a visible stable brain alongside `.kfc/CODEX_READY.md`.
- Clarified that KFC owns and refreshes the client-root `AGENTS.md` managed block as the project-specific `/init` contract, while `.kfc/CODEX_READY.md` remains the per-session brief.
- Reworked `kfc client` toward a reusable one-command entrypoint so reruns refresh/reuse the handoff, wait for Codex completion, and auto-clean `.kfc/CODEX_READY.md` only after archived-done proof.
- Added advisory semantic-version impact reporting to `commit:codex`, with `none|patch|minor|major` derived from the conventional commit message while keeping actual workspace version bumps release-only.
- Expanded the generated client-root `AGENTS.md` contract so fresh client sessions now see a short workflow command map for plan validation, readiness recovery, doctor recovery, and cleanup without relying on repo-only scripts.
- Refined client-bootstrap script/docs resolution so doc/help paths for `kfc client` are derived from active `resourcesDir` or install fallback, making reuse in new project locations cleaner and less brittle.
## 2026-03-14
- Reorganized CLI source surface/lib layout into subdomains (`src/commands/surface`, `src/lib/core|plan|remote`) while preserving backward-compatible import shims at previous entrypoints.

## 2026-03-18

- Simplified KFC runtime plan-workspace behavior by moving shared plan path/selection helpers into `@kamishino/kfc-runtime`, then reusing that SSOT in repo bootstrap, `kfc-plan init`, and flow/run surfaces instead of keeping duplicated filesystem logic in each caller.
- Normalized new plan creation so both repo fallback bootstrap and `kfc-plan init` create sequenced filenames under the documented `YYYY-MM-DD-<seq>-<route>-<topic-slug>.md` contract while still leaving legacy plan files readable.
- Hardened project-root auto-detection so a valid project rooted directly at the user home directory is detected correctly without letting nested home subfolders accidentally bubble up to home.
- Reworked `verify:codex-intelligence` from long exact-sentence matching to structured heading/anchor checks so documentation wording can evolve without breaking governance as long as required sections, IDs, and command anchors remain present.
