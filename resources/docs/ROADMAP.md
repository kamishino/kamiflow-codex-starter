# Roadmap

Current phase:

- `kamiflow-core` skill pilot in progress
- first implemented skill: `kamiflow-core`
- mode-aware route policy added for Plan/Build
- `resources/` is SSOT for skill definitions and templates
- `.agents/skills` is runtime working surface

Policy:

- Commit `.codex` config template only (`config.example.toml`).
- Commit SSOT skills under `resources/skills`.
- Keep `.codex/config.toml` local and ignored.
- Do not store secrets in tracked `.codex` files.

Next phase:

1. dogfood `$kamiflow-core` in this repo and tune routing behavior
2. improve references based on real usage feedback
3. define optional add-on skills only if needed
4. validate portability across projects
