# Resources Scaffold

Generic, reusable container for portable Kami Flow Codex assets.

## Directories

- `skills/`: Codex skills (`SKILL.md`-based), SSOT.
- `scripts/`: helper scripts (JS/TS planned).
- `templates/`: reusable templates and assets.
- `docs/`: guidance and rollout docs for this resource pack.

Current pilot includes one real skill:

- `skills/kamiflow-core/`
- includes mode-aware routing for Codex Plan/Build workflows.

Sync SSOT skills into runtime for in-repo dogfooding:

```bash
npm run codex:sync
```

## Core Docs

- `docs/PLAN_CONTRACT_V1.md`: plan readiness and gate rules.
- `docs/CODEX_KFP_RUNBOOK.md`: canonical local dogfood flow.
- `docs/ROUTE_PROMPTS.md`: copy/paste prompts for `kamiflow-core`.
