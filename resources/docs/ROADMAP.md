# Roadmap

Current phase:

- `kamiflow-core` skill pilot in progress
- first implemented skill: `kamiflow-core`
- mode-aware route policy added for Plan/Build
- `resources/` is SSOT for skill definitions and templates
- docs freshness protocol added for tracked governance docs and generated doc mirrors
- `.agents/skills` is runtime working surface
- Plan Contract v1 and Codex+KFC Plan runbook added
- Codex surface architecture doctrine now makes CLI execution, App control-plane usage, and observer-first KFC surfaces explicit
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

1. run one external-repo portability smoke and compare it with the local repo-shape matrix evidence
2. tune route prompts and gate wording from onboarding/portability feedback
3. carry the clarified surface hierarchy (`Codex-CLI`, Codex App, `kfc`, `kfc web`, `kfc-session`, `kfc-chat`, desktop shell) into targeted rules/reviews where deterministic boundaries exist
4. extend portability proof to a wider multi-repo matrix (JS/TS + non-JS)

