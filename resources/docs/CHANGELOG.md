# Changelog

Decision log for durable user-visible or workflow-affecting changes.
This file is the SSOT. The root `CHANGELOG.md` is a generated mirror.

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
