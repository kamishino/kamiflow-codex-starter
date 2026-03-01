# Roadmap

Current phase:

- `kamiflow-core` skill pilot in progress
- first implemented skill: `kamiflow-core`
- mode-aware route policy added for Plan/Build
- `resources/` is SSOT for skill definitions and templates
- `.agents/skills` is runtime working surface
- Plan Contract v1 and Codex+KFP runbook added

Policy:

- Commit `.codex` config template only (`config.example.toml`).
- Commit SSOT skills under `resources/skills`.
- Keep `.codex/config.toml` local and ignored.
- Do not store secrets in tracked `.codex` files.

Next phase:

1. dogfood the canonical `plan -> build -> check` loop with real plan files
2. tune route prompts and gate wording from user feedback
3. consider helper automation only after manual loop is stable
4. validate portability across projects
