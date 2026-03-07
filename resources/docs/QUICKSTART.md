# KFC Quickstart

Use this page as the shortest path to run Kami Flow Codex (KFC) correctly.

## Run in KFC Repo

This is the maintainer and dogfooding repository (`kamiflow-codex-starter`).

```bash
npm install
npm run bootstrap
```

If you need to test KFC inside this repo fixtures:

```bash
npm run dogfood:link
npm run dogfood:smoke
```

If you need client linking, prepare the package from this repo once:

```bash
npm run link:self
```

## Run in Client Project

Do not use `npm run ...` from this repo in client projects.

From the root of the external client repository (new/existing folder, not `kamiflow-codex-starter`):

```bash
kfc client --force
```

`kfc client --force` now runs one smart-recovery cycle by default, installs the project-local runtime skill at `.agents/skills/kamiflow-core/SKILL.md`, creates `.kfc/CODEX_READY.md`, scaffolds private client lessons at `.kfc/LESSONS.md` plus `.local/kfc-lessons/`, ensures `.gitignore` contains `.kfc/`, `.local/`, and `.agents/`, and auto-launches:

```bash
codex exec --full-auto "Read .kfc/CODEX_READY.md and execute the mission."
```

It still prints:
- `Onboarding Status: PASS|BLOCK`
- `Stage: init|bootstrap|ready_brief|plan_ready|execution_ready|blocked|done`
- `Error Code: CLIENT_*`
- `Recovery: <exact command>` when blocked
- `Next: <single concrete next action>`

To keep bootstrap setup-only and skip the automatic handoff:

```bash
kfc client --force --no-launch-codex
```

Low-level equivalent (only when you need manual bootstrap control):

```bash
kfc client bootstrap --project . --profile client --force
```

If auto-launch is disabled or fails, run the exact fallback command printed by KFC. Codex should then read `.kfc/CODEX_READY.md`, read `.kfc/LESSONS.md` when present, and continue autonomously.

This flow is designed for no user reminder loop after bootstrap. Codex should continue from the generated brief and the project-local skill without waiting for routine chat reminders.
The lesson scaffolding is private and gitignored by design; Codex can still read it locally.

After work is complete, cleanup is required:

```bash
kfc client done
```

During normal implementation turns, Codex should run check validations automatically and report `Check: PASS|BLOCK` before final response.

## Copy Codex Sessions Between Machines

```bash
# on each machine once: generate local age key + trust self
kfc session key gen --name <device-name>

# view your public key (share this with trusted devices)
kfc session key show

# add trusted destination device(s) on source machine
kfc session trust add --name <peer-device> --pubkey <age1...>

# source machine: push active session (auto-id: --id > CODEX_THREAD_ID > latest session file)
kfc session push --to E:/transfer/codex-sessions

# source machine: push exact session id
kfc session push --id 019caccc-f25d-7151-ad1d-6eab893d714d --to E:/transfer/codex-sessions

# destination machine: pull latest indexed session into ~/.codex/sessions
kfc session pull --from E:/transfer/codex-sessions

# destination machine: pull exact session id
kfc session pull --from E:/transfer/codex-sessions --id 019caccc-f25d-7151-ad1d-6eab893d714d
```

Transfer folder stores encrypted `.kfcsess` artifacts plus minimal metadata index (`kfc-session-index.json`) using age recipient encryption.

## Troubleshooting

- `kfc: command not found`: run `npm link @kamishino/kamiflow-codex` again in the client project.
- Missing plan UI: rerun `kfc client --force`.
- Missing project-local KFC skill: rerun `kfc client --force`.
- Missing client lessons file: rerun `kfc client --force`.
- Codex did not auto-launch: rerun the exact `Manual fallback:` command printed by KFC, or use `kfc client --force --no-launch-codex` if you want setup only.
- Plan bootstrap failed: run `kfc flow ensure-plan --project .` (or `kfc plan init --project . --new` as compatibility fallback).
- Flow behavior mismatch: run `kfc client doctor --project . --fix`.
- If onboarding reports `Onboarding Status: BLOCK`, follow the printed `Recovery:` command exactly.
- Rules mismatch: rerun `kfc client --force`.
- Cannot find local Codex sessions folder: run `kfc session where`.
- `kfc session push` says no trusted recipients: run `kfc session key gen --name <device>` then `kfc session trust add --name <peer> --pubkey <age1...>`.
- Pull decrypt failure: verify local key exists (`kfc session key show`) and source machine encrypted for your recipient.
- In KFC repo after skill edits, if runtime instructions are stale: run `npm run codex:sync:skills -- --force`.

## Next Docs

- `resources/docs/CLIENT_KICKOFF_PROMPT.md`
- `resources/docs/CLIENT_A2Z_PLAYBOOK.md`
- `resources/docs/COMMAND_BOUNDARY_POLICY.md`
- `resources/docs/CODEX_KFP_RUNBOOK.md`
- `resources/docs/CODEX_RULES_RUNBOOK.md`
- `resources/docs/PORTABILITY_RUNBOOK.md`
