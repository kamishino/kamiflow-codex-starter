# Roadmap

Current phase:

- `kamiflow-core` skill pilot in progress
- first implemented skill: `kamiflow-core`
- mode-aware route policy added for Plan/Build
- `resources/` is SSOT for skill definitions and templates
- docs freshness protocol added for tracked governance docs and generated doc mirrors
- `.agents/skills` is runtime working surface
- Plan Contract v1 and Codex+KFC Plan runbook added
- portability validation toolkit added:
  - one-repo runbook (`PORTABILITY_RUNBOOK.md`)
  - smoke log template (`resources/templates/portability-smoke-log.md`)
  - scripted smoke helper (`npm run portability:smoke`)

Policy:

- Commit `.codex` config template only (`config.example.toml`).
- Commit SSOT skills under `resources/skills`.
- Keep `.codex/config.toml` local and ignored.
- Do not store secrets in tracked `.codex` files.

Next phase:

1. run one external-repo portability smoke and store evidence log
2. tune route prompts and gate wording from user feedback
3. add optional helper automation only after portability baseline is stable
4. extend to multi-repo matrix (JS/TS + non-JS)

