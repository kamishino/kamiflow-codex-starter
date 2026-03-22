# Codex Rules Runbook

Use this runbook to manage Codex execution-policy rules from SSOT and sync them to runtime scopes.

## Goal

Keep a single source of truth for rules in:

- `resources/rules/base.rules`
- `resources/rules/profiles/dogfood.rules`
- `resources/rules/profiles/client.rules`

Then synchronize into runtime locations that Codex loads:

- repo scope: `<repo>/.codex/rules/kamiflow.rules`
- project scope: `<project>/.codex/rules/kamiflow.rules` paired with `<project>/.codex/config.toml` for project-local activation
- home scope: `$CODEX_HOME/rules/kamiflow.rules` (or `~/.codex/rules/kamiflow.rules`)

Skills are a separate contract: `resources/skills/*` stays the single canonical skill source, and skill sync copies the same runtime artifact into repo and client targets. Dogfood versus client differences belong in rules profiles and entrypoint context, not separate skill variants.

## Rules of Engagement

- Edit SSOT only (`resources/rules/*`).
- Do not edit generated runtime files.
- Do not overwrite `.codex/rules/default.rules` from SSOT.

## Profile Selection

Profile is resolved in this order:

1. `--profile <dogfood|client>`
2. existing `<project>/kamiflow.config.json` -> `codex.rulesProfile`
3. default: `client`

This profile selection applies to rules only. Skill sync does not resolve `dogfood|client` variants.

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

# Skills only: shared runtime artifact, no profile split
npm run codex:sync:skills -- --force

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

Do not expect `--profile` to change skill output. It only changes which rules overlay is composed.

Client-project preferred path:

`kamiflow.config.json` is now optional advanced config. KFC reads it when present, but default client bootstrap uses bundled defaults plus local runtime artifacts instead of generating the file automatically.

### Run in Client Project

```bash
# In client project after linking kfc:
kfc client --force
```

Run from the client repository root (external project folder, not this KFC repo).
`kfc client --force` keeps `kamiflow.config.json` optional by default, ensures plan UI availability (project-local install or linked fallback), creates a root `AGENTS.md` managed contract, syncs project rules, creates the private project-local Codex binding at `.codex/config.toml`, syncs the project-local runtime skill to `.agents/skills/kamiflow-core/SKILL.md`, scaffolds `.kfc/LESSONS.md` plus `.local/kfc-lessons/`, ensures `.gitignore` contains `.kfc/`, `.local/`, `.agents/`, and `.codex/config.toml`, and creates `.kfc/CODEX_READY.md` plus one active plan.

The client project receives the same shared `kamiflow-core` skill body as repo dogfood. The client-safe behavior difference comes from client rules plus client command context.

## Verification

### Run in KFC Repo

After sync, validate policy decisions:

```bash
codex execpolicy check --rules .codex/rules/kamiflow.rules npm run dogfood:link
codex execpolicy check --rules .codex/rules/kamiflow.rules npm run codex:sync:rules -- --scope project --project . --force
codex execpolicy check --rules .codex/rules/kamiflow.rules kfc flow ensure-plan --project .
codex execpolicy check --rules .codex/rules/kamiflow.rules kfc flow ready --project .
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


