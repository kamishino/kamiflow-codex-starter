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
cd <path-to-client-project>
npm link @kamishino/kamiflow-codex
npx --no-install kfc client bootstrap --project . --profile client
```

After bootstrap, continue with:

```bash
kfc flow ensure-plan --project .
kfc flow next --project . --plan <plan-id> --style narrative
```

## Troubleshooting

- `kfc: command not found`: run `npm link @kamishino/kamiflow-codex` again in the client project.
- Missing plan UI: rerun `kfc client bootstrap --project . --profile client`.
- Rules mismatch: rerun `kfc client bootstrap --project . --profile client --force`.

## Next Docs

- `resources/docs/CLIENT_KICKOFF_PROMPT.md`
- `resources/docs/CLIENT_A2Z_PLAYBOOK.md`
- `resources/docs/COMMAND_BOUNDARY_POLICY.md`
- `resources/docs/CODEX_KFP_RUNBOOK.md`
- `resources/docs/CODEX_RULES_RUNBOOK.md`
- `resources/docs/PORTABILITY_RUNBOOK.md`
