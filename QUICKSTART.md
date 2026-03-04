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

In the client project:

```bash
kfc client --force
```

For each task, use this KISS loop:

1. Tell Codex to read `.kfc/CODEX_READY.md` and execute the mission.
2. Codex should run routine flow commands autonomously (no user reminder loop).
3. Before any implementation route (`build`/`fix`), require:

```bash
kfc flow ensure-plan --project .
kfc flow ready --project .
```

4. If behavior looks off, run:

```bash
kfc client doctor --project . --fix
```

After work is complete, cleanup is required:

```bash
kfc client done
```

During normal implementation turns, Codex should run check validations automatically and report `Check: PASS|BLOCK` before final response.

## Troubleshooting

- `kfc: command not found`: run `npm link @kamishino/kamiflow-codex` again in the client project.
- Missing plan UI: rerun `kfc client --force`.
- Plan bootstrap failed: run `kfc flow ensure-plan --project .` (or `kfc plan init --project . --new` as compatibility fallback).
- Flow behavior mismatch: run `kfc client doctor --project . --fix`.
- Rules mismatch: rerun `kfc client --force`.
- In KFC repo after skill edits, if runtime instructions are stale: run `npm run codex:sync:skills -- --force`.

## Next Docs

- `resources/docs/CLIENT_KICKOFF_PROMPT.md`
- `resources/docs/CLIENT_A2Z_PLAYBOOK.md`
- `resources/docs/COMMAND_BOUNDARY_POLICY.md`
- `resources/docs/CODEX_KFP_RUNBOOK.md`
- `resources/docs/CODEX_RULES_RUNBOOK.md`
- `resources/docs/PORTABILITY_RUNBOOK.md`
