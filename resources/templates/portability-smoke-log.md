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
| 4 | Plan init | `npx --no-install kfc plan init --project . --new` | new plan file created | | |
| 5 | Plan validate | `npx --no-install kfc plan validate --project .` | validation OK | | |
| 6 | Plan serve health | `GET /api/health` | `{ "ok": true }` | | |
| 7 | Route loop | `start -> plan -> build -> check -> done` | completed loop | | |
| 8 | Archive | `.local/plans/done/<file>.md` | file archived | | |

## Blockers (if any)

- blocker:
- impact:
- recovery:

## Notes

- command output snippets:
- differences between expected and actual behavior:
- follow-up actions:
