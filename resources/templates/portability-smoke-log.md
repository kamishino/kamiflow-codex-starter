# Portability Smoke Log

## Metadata

- Date (UTC):
- Tool Repo:
- Target Project:
- OS / Shell:
- Node / npm:
- Link Mode: on | off
- Result: PASS | BLOCK

## Step Results

| # | Step | Command | Expected | Actual | Result |
|---|------|---------|----------|--------|--------|
| 1 | Link CLI | `npm link` | CLI linked | | |
| 2 | Link package in target | `npm link @kamishino/kamiflow-codex` | `kfc` available in target | | |
| 3 | CLI help | `npx --no-install kfc --help` | help output | | |
| 4 | Bootstrap (baseline) | `npx --no-install kfc client bootstrap --project . --profile client` | config/rules/plan/health checks PASS | | |
| 5 | Optional route loop | `start -> plan -> build -> check -> done` | completed loop | | |
| 6 | Optional archive check | `.local/plans/done/<file>.md` | file archived | | |

## Blockers (if any)

- blocker:
- impact:
- recovery:

## Notes

- command output snippets:
- differences between expected and actual behavior:
- follow-up actions:
