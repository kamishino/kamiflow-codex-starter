# Roadmap

Current phase:

- structure only
- no implemented skills
- no implemented prompt commands
- `resources/` is SSOT for docs/templates
- `.codex/` is runtime working surface

Policy:

- Commit `.codex` templates only (`config.example.toml`, prompts, skills).
- Keep `.codex/config.toml` local and ignored.
- Do not store secrets in tracked `.codex` files.

Next phase (after Kami Flow documentation is provided):

1. define prompt command set
2. define skill set and trigger descriptions
3. add helper scripts and templates
4. validate portability across projects
