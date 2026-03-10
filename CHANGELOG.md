<!-- GENERATED FILE. Do not edit directly. -->
<!-- Source: resources/docs/CHANGELOG.md -->

# Changelog

Decision log for durable user-visible or workflow-affecting changes.
This file is the SSOT. The root `CHANGELOG.md` is a generated mirror.

## 2026-03-10

- Added a docs freshness protocol so workflow-impacting changes now require tracked doc review, generated doc sync, and governance verification before commit-safe completion.
- Formalized the tracked/private split: tracked governance docs live in the repo, while project-private memory stays in `.kfc/LESSONS.md` and `.local/kfc-lessons/`.
