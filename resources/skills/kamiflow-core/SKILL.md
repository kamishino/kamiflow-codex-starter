---
name: kamiflow-core
description: Core Kami Flow workflow router for start, plan, build, check, research, and fix execution. Use when users ask to start an idea, plan work, build changes, check quality, research unknowns, or fix targeted issues in a consistent project workflow.
---

# Kami Flow Core

Use this skill as the single workflow entrypoint.

## Routing

1. Read `references/command-map.md`.
2. Classify the request into one command route.
3. Load only the matched reference file.
4. Produce output using that command's required format.
5. End with one explicit next command.

## Command Routes

- `start` -> `references/start.md`
- `plan` -> `references/plan.md`
- `build` -> `references/build.md`
- `check` -> `references/check.md`
- `research` -> `references/research.md`
- `fix` -> `references/fix.md`

## Global Rules

- Keep output concise and structured.
- No emoji in default output.
- Do not skip required gates from the selected command reference.
- If scope or risk increases mid-task, route back to `research` or `plan`.
