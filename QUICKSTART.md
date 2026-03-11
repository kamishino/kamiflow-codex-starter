<!-- GENERATED FILE. Do not edit directly. -->
<!-- Source: resources/docs/QUICKSTART.md -->

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

`kfc client` prints doc and quick-start hints from the active install location (project-level `resourcesDir` or package resources fallback), so the exact doc paths can vary by environment.

`kfc client` is the reusable client-project entrypoint. It starts with an inline inspection pass, auto-initializes a minimal `package.json` when the target folder is truly empty, creates or refreshes the root `AGENTS.md` managed contract, installs the project-local runtime skill at `.agents/skills/kamiflow-core/SKILL.md`, creates or refreshes `.kfc/CODEX_READY.md`, scaffolds private client lessons at `.kfc/LESSONS.md` plus `.local/kfc-lessons/`, ensures `.gitignore` contains `.kfc/`, `.local/`, and `.agents/`, runs one smart-recovery cycle only for recoverable bootstrap issues, and auto-launches:

```bash
codex exec --full-auto "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission."
```

It still prints:
- `Inspection Status: PASS|BLOCK`
- `Repo Shape: empty_new_repo|ready|needs_minor_fixes|risky`
- `Apply Mode: auto|blocked`
- `Planned Changes: <summary>`
- `Onboarding Status: PASS|BLOCK`
- `Stage: init|inspect|bootstrap|ready_brief|plan_ready|execution_ready|blocked|done`
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

If auto-launch is disabled or fails, run the exact fallback command printed by KFC. Codex should then read `AGENTS.md` first, read `.kfc/CODEX_READY.md` when present, read `.kfc/LESSONS.md` when present, and continue autonomously.

Important first-run behavior:
- onboarding `PASS` means the client environment is ready, not that the active plan is already build-ready
- rerunning plain `kfc client` should reuse or refresh the existing handoff instead of blocking on an old `.kfc/CODEX_READY.md`
- risky mixed repos BLOCK before mutation instead of letting KFC guess
- if bootstrap created a fresh draft plan, `.kfc/CODEX_READY.md` will direct Codex to finish Brainstorm/Plan before any build route
- `kfc flow ready --project .` should only be the first action when the active plan is already build-ready
- KFC auto-cleans `.kfc/CODEX_READY.md` only after the active onboarding plan is archived done; otherwise the handoff is preserved for recovery

This flow is designed for no user reminder loop after bootstrap. Codex should continue from the generated brief and the project-local skill without waiting for routine chat reminders.
The lesson scaffolding is private and gitignored by design; Codex can still read it locally.
Root `AGENTS.md` is the stable client-repo brain. KFC owns and refreshes its managed block as the project-specific `/init` contract. It now includes the client workflow command map plus portable Kami Flow Core sections for `Plan Lifecycle Contract`, `Evidence Gate`, `Smooth Flow Protocol`, `Markdown Readability Policy`, blocker recovery, and docs/closeout review. Read `.kfc/CODEX_READY.md` when present; otherwise continue from the active plan plus lessons.

To manage private project lessons after bootstrap:

```bash
kfc client lessons capture --project . --type incident --title "Broken setup" --lesson "Use X before Y" --context "Short trigger/context"
kfc client lessons pending --project .
kfc client lessons show --project . --id LESSON-20260307-001
kfc client lessons promote --project . --id LESSON-20260307-001 --summary "Durable lesson Codex should remember"
kfc client lessons list --project .
```

Use `.local/kfc-lessons/` for raw private history and `.kfc/LESSONS.md` for the curated lessons Codex should read in future sessions.

Manual cleanup fallback:

```bash
kfc client done
```

During normal implementation turns, Codex should run check validations automatically and report `Check: PASS|BLOCK` before final response.

## Update KFC In Client Project

If the client project already has KFC installed, use the client-side update flow:

```bash
kfc client update --project .
```

This is preview-only by default. It reports:

- detected install source (`link|git|file_or_tarball|unknown`)
- whether `package.json` will change
- exact apply command

To execute the update:

```bash
kfc client update --project . --apply
```

Important behavior:

- linked installs: refresh-only; no dependency rewrite
- git installs: reinstall from saved spec or `--from`
- file/tarball installs: require `--from <folder|tgz>` for apply
- apply always reruns client refresh/verification without auto-launching Codex

## Copy Codex Sessions Between Machines

```bash
# on each machine once: generate local age key + trust self
kfc session key gen --name <device-name>

# view your public key (share this with trusted devices)
kfc session key show

# add trusted destination device(s) on source machine
kfc session trust add --name <peer-device> --pubkey <age1...>

# source machine: push latest active session from the local session folder
kfc session push --to <TRANSFER_DIR>/codex-sessions

# source machine: push exact session id
kfc session push --id <SESSION_ID> --to <TRANSFER_DIR>/codex-sessions

# destination machine: pull latest indexed session into ~/.codex/sessions
kfc session pull --from <TRANSFER_DIR>/codex-sessions

# destination machine: pull exact session id
kfc session pull --from <TRANSFER_DIR>/codex-sessions --id <SESSION_ID>
```

Transfer folder stores encrypted `.kfc-session.json` artifacts plus minimal metadata index (`kfc-session-index.json`) using age recipient encryption.

## Mobile Remote Surface

Optional advanced usage:

```bash
kfc remote serve --project . --host 127.0.0.1 --port 4320
```

This starts a separate mobile-friendly web surface for:

- viewing the mirrored session state
- reading the transcript
- sending serialized prompts into the workstation queue

Recommended network model: private reachability such as Tailscale. See `resources/docs/REMOTE_RUNBOOK.md`.

## Bound Codex Session Chat

Optional advanced utility:

```bash
kfc-chat bind --project . --session-id <SESSION_ID>
kfc-chat serve --project .
```

This starts a separate browser surface for:

- one bound Codex session per project
- WebSocket live transcript and session state
- one-click discover-and-bind from nearby `~/.codex/sessions` sessions
- guarded prompt submission via `codex exec resume <SESSION_ID> <prompt>`
- manual `codex resume <SESSION_ID>` handoff for terminal-style continuation

When started through `kfc web`, the printed chat URL now includes an optional `?token=<chat-token>` query parameter for quick reopen, and also works at `/chat` without query parameters.

Runbook: `resources/docs/KFC_CHAT_RUNBOOK.md`.

## Troubleshooting

- `kfc: command not found`: run `npm link @kamishino/kamiflow-codex` again in the client project.
- Missing plan UI: rerun `kfc client --force`.
- Missing project-local KFC skill: rerun `kfc client --force`.
- Missing client lessons file: rerun `kfc client --force`.
- Codex did not auto-launch: rerun the exact `Manual fallback:` command printed by KFC, or use `kfc client --force --no-launch-codex` if you want setup only.
- `kfc client update` is blocked for file/tarball installs: rerun with `--from <folder|tgz> --apply`.
- Missing `package.json` in a non-empty folder: run `npm init -y`, then rerun `kfc client --force`.
- Plan bootstrap failed: run `kfc flow ensure-plan --project .` (or `kfc plan init --project . --new` as compatibility fallback).
- Flow behavior mismatch: run `kfc client doctor --project . --fix`.
- If onboarding reports `Onboarding Status: BLOCK`, follow the printed `Recovery:` command exactly.
- Rules mismatch: rerun `kfc client --force`.
- Cannot find local Codex sessions folder: run `kfc session where`.
- `kfc session push` says no trusted recipients: run `kfc session key gen --name <device>` then `kfc session trust add --name <peer> --pubkey <age1...>`.
- Pull decrypt failure: verify local key exists (`kfc session key show`) and source machine encrypted for your recipient.
- `kfc-chat` says no Codex session is bound: run `kfc-chat bind --project . --session-id <id>` first.
- In KFC repo after skill edits, if runtime instructions are stale: run `npm run codex:sync:skills -- --force`.

## Next Docs

- `resources/docs/CLIENT_KICKOFF_PROMPT.md`
- `resources/docs/CLIENT_A2Z_PLAYBOOK.md`
- `resources/docs/COMMAND_BOUNDARY_POLICY.md`
- `resources/docs/CODEX_KFC_PLAN_RUNBOOK.md`
- `resources/docs/CODEX_RULES_RUNBOOK.md`
- `resources/docs/PORTABILITY_RUNBOOK.md`
- `resources/docs/REMOTE_RUNBOOK.md`
- `resources/docs/KFC_CHAT_RUNBOOK.md`
