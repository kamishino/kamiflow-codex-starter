# Codex Rules Runbook

Use this runbook to manage Codex execution-policy rules from SSOT and sync them to runtime scopes.

## Goal

Keep a single source of truth for rules in:

- `resources/rules/base.rules`
- `resources/rules/profiles/dogfood.rules`
- `resources/rules/profiles/client.rules`

Then synchronize into runtime locations that Codex loads:

- repo scope: `<repo>/.codex/rules/kamiflow.rules`
- project scope: `<project>/.codex/rules/kamiflow.rules`
- home scope: `$CODEX_HOME/rules/kamiflow.rules` (or `~/.codex/rules/kamiflow.rules`)

## Rules of Engagement

- Edit SSOT only (`resources/rules/*`).
- Do not edit generated runtime files.
- Do not overwrite `.codex/rules/default.rules` from SSOT.

## Profile Selection

Profile is resolved in this order:

1. `--profile <dogfood|client>`
2. `<project>/kamiflow.config.json` -> `codex.rulesProfile`
3. default: `client`

Project config example:

```json
{
  "version": "1",
  "workflow": {
    "defaultProvider": "codex",
    "profile": "default"
  },
  "codex": {
    "rulesProfile": "dogfood"
  }
}
```

## Sync Commands

### Run in KFC Repo

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

# Rules only: explicit profile override
npm run codex:sync:rules -- --scope project --project <path-to-project> --profile dogfood --force
npm run codex:sync:rules -- --scope project --project <path-to-project> --profile client --force
```

Client-project preferred path:

### Run in Client Project

```bash
# In client project after linking kfc:
npx --no-install kfc client bootstrap --project . --profile client
```

`client bootstrap` creates or validates config, ensures plan UI availability (project-local install or linked fallback), and syncs project rules.

## Verification

### Run in KFC Repo

After sync, validate policy decisions:

```bash
codex execpolicy check --rules .codex/rules/kamiflow.rules npm run dogfood:link
codex execpolicy check --rules .codex/rules/kamiflow.rules npm run codex:sync:rules -- --scope project --project . --force
codex execpolicy check --rules .codex/rules/kamiflow.rules kfc flow ensure-plan --project .
codex execpolicy check --rules .codex/rules/kamiflow.rules kfc flow apply --project . --plan PLAN-1 --route build --result progress
codex execpolicy check --rules .codex/rules/kamiflow.rules git reset --hard
```

Expected pattern:

- Kami Flow workflow commands resolve to `allow` or `prompt` based on SSOT rules.
- destructive commands like `git reset --hard` resolve to `forbidden`.

## Troubleshooting

- `Permission denied writing ...`: rerun sync from an elevated terminal if destination is outside writable scope.
- `Missing SSOT rules file`: ensure `resources/rules/base.rules` and `resources/rules/profiles/<profile>.rules` exist.
- rule not matching: run `codex execpolicy check "<exact command>"` and adjust `pattern/match/not_match`.
