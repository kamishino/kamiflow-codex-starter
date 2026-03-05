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

| # | Step | Command | Result |
|---|------|---------|--------|
| 1 | Link CLI | `npm link` | PASS/BLOCK |
| 2 | Link package in target | `npm link @kamishino/kamiflow-codex` | PASS/BLOCK |
| 3 | CLI help | `npx --no-install kfc --help` | PASS/BLOCK |
| 4 | Client setup | `npx --no-install kfc client --force --port 4310` | PASS/BLOCK |
| 5 | Route loop | `start -> plan -> build -> check -> done` | PASS/BLOCK |
| 6 | Archive check | `.local/plans/done/<file>.md` exists | PASS/BLOCK |

## Blockers (if any)

- blocker:
- impact:
- recovery:

## Notes

- command output snippets:
- follow-up actions:
