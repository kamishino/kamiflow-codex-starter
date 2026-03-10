<!-- GENERATED FILE. Do not edit directly. -->
<!-- Source: resources/docs/CHANGELOG.md -->

# Changelog

Decision log for durable user-visible or workflow-affecting changes.
This file is the SSOT. The root `CHANGELOG.md` is a generated mirror.

## 2026-03-10

- Added a docs freshness protocol so workflow-impacting changes now require tracked doc review, generated doc sync, and governance verification before commit-safe completion.
- Formalized the tracked/private split: tracked governance docs live in the repo, while project-private memory stays in `.kfc/LESSONS.md` and `.local/kfc-lessons/`.
- Improved client onboarding so truly empty folders auto-initialize a minimal `package.json`, non-Node folders block with direct recovery, and `.kfc/CODEX_READY.md` now hands Codex off according to the active plan state instead of always pushing `kfc flow ready` first.
- Added an inline client inspection contract before bootstrap mutation so `kfc client` now classifies repo shape, shows planned touches, and blocks risky mixed repos before changing files.
- Added a repo-shape portability matrix runner plus route/runbook updates so client proof, inspection-aware handoff, and hosted product hierarchy are documented as one coherent workflow.
