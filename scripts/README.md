# scripts

## Purpose

Repository automation and maintainer tooling. Keep script helpers in a named
domain folder and avoid putting product runtime code here.

## Domain folders

- `client/`: client bootstrap/update workflows and related orchestration scripts.
- `codex/`: Codex rule/sync and runtime policy tooling.
- `docs/`: documentation sync and governance verification helpers.
- `dogfood/`: dogfooding fixture maintenance and helpers.
- `git-hooks/`: hook scripts for commit/session safety.
- `kfc-chat/`: chat surface task helpers.
- `kfc-plan/`: plan-surface task helpers.
- `kfc-session/`: session tooling helpers.
- `kfc-web/`: web helper scripts.
- `policy/`: codex policy sync validation scripts.
- `portability/`: portability and transfer helpers.
- `release/`: release and publish preparation helpers.
- `remote/`: remote tooling helpers.

## Convention

- Keep scripts domain-specific and composable.
- Prefer shared helpers over duplicate one-off ad hoc scripts.
- Keep scripts free of application runtime coupling; source code should live in `src/` or `packages/`.
