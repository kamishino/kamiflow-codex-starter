# Codex Rules Runbook

Use this runbook to manage Codex execution-policy rules from SSOT and sync them to runtime scopes.

## Goal

Keep a single source of truth for rules in:

- `resources/rules/kamiflow.rules`

Then synchronize into runtime locations that Codex loads:

- repo scope: `<repo>/.codex/rules/kamiflow.rules`
- project scope: `<project>/.codex/rules/kamiflow.rules`
- home scope: `$CODEX_HOME/rules/kamiflow.rules` (or `~/.codex/rules/kamiflow.rules`)

## Rules of Engagement

- Edit SSOT only (`resources/rules/*`).
- Do not edit generated runtime files.
- Do not overwrite `.codex/rules/default.rules` from SSOT.

## Sync Commands

Run from repository root (`kamiflow-codex-starter`):

```bash
# Sync skills + rules (default scope = all for rules)
npm run codex:sync

# Rules only: repo scope
npm run codex:sync:rules -- --scope repo --force

# Rules only: project scope (explicit path)
npm run codex:sync:rules -- --scope project --project <path-to-project> --force

# Rules only: project scope (fallback to current working directory)
npm run codex:sync:rules -- --scope project --force

# Rules only: home scope
npm run codex:sync:rules -- --scope home --force
```

## Verification

After sync, validate policy decisions:

```bash
codex execpolicy check --rules resources/rules/kamiflow.rules npm run dogfood:link
codex execpolicy check --rules resources/rules/kamiflow.rules npm run codex:sync:rules -- --scope project --project . --force
codex execpolicy check --rules resources/rules/kamiflow.rules git reset --hard
```

Expected pattern:

- Kami Flow workflow commands resolve to `allow` or `prompt` based on SSOT rules.
- destructive commands like `git reset --hard` resolve to `forbidden`.

## Troubleshooting

- `Permission denied writing ...`: rerun sync from an elevated terminal if destination is outside writable scope.
- `Missing SSOT rules file`: ensure `resources/rules/kamiflow.rules` exists.
- rule not matching: run `codex execpolicy check "<exact command>"` and adjust `pattern/match/not_match`.
