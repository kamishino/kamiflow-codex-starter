# Resources Scaffold

Generic, reusable container for portable Kami Flow Codex assets.

## Directories

- `skills/`: Codex skills (`SKILL.md`-based), SSOT.
  - skill runtime output is shared by target; do not fork dogfood/client skill variants unless a later banner-only overlay is explicitly needed.
- `rules/`: Codex execution-policy rules (`.rules`), SSOT.
  - `base.rules`: shared baseline safety and sync allowances.
  - `profiles/dogfood.rules`: dogfood overlay.
  - `profiles/client.rules`: client-project overlay.
- `scripts/`: helper scripts (JS/TS planned).
- `templates/`: reusable templates and assets.
- `docs/`: guidance and rollout docs for this resource pack.

Current pilot includes one real skill:

- `skills/kamiflow-core/`
- includes mode-aware routing for Codex Plan/Build workflows.

Sync SSOT resources into runtime for in-repo dogfooding:

```bash
npm run codex:sync
```

`codex:sync` includes rules sync for `repo`, `project` (cwd fallback), and `home` scopes by default.
Skill sync stays non-profiled: repo runtime and client runtime both receive the same `resources/skills/*` content.
Use `codex:sync:rules -- --scope <repo|project|home>` for targeted sync.

Skills sync example:

```bash
npm run codex:sync:skills -- --force
```

`--profile` is for rules only. Skills remain shared SSOT artifacts.

Rules sync examples:

```bash
npm run codex:sync:rules -- --scope repo --force
npm run codex:sync:rules -- --scope project --project <path-to-project> --force
npm run codex:sync:rules -- --scope home --force
npm run codex:sync:rules -- --scope project --project <path-to-project> --profile dogfood --force
npm run codex:sync:rules -- --scope project --project <path-to-project> --profile client --force
```

## Core Docs

- `docs/PLAN_CONTRACT_V1.md`: plan readiness and gate rules.
- `docs/CODEX_KFC_PLAN_RUNBOOK.md`: canonical local dogfood flow.
- `docs/ROUTE_PROMPTS.md`: copy/paste prompts for `kamiflow-core`.
- `docs/CHANGELOG.md`: durable decision log for workflow and user-facing decisions.
- `docs/PORTABILITY_RUNBOOK.md`: one-external-repo portability validation flow.
- `docs/CODEX_RULES_RUNBOOK.md`: rules SSOT, sync scopes, and verification flow.
