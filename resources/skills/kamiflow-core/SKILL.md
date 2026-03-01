---
name: kamiflow-core
description: Core Kami Flow workflow router for start, plan, build, check, research, and fix execution. Use when users ask to start an idea, plan work, build changes, check quality, research unknowns, or fix targeted issues in a consistent project workflow.
---

# Kami Flow Core

Use this skill as the single workflow entrypoint.

## Mode Selector

Select mode before executing route logic:

- `start` -> `Plan`
- `plan` -> `Plan`
- `research` -> `Plan`
- `build` -> `Build`
- `fix` -> `Build`
- `check` -> `Plan` by default; use `Build` only when running commands/tests or proposing file edits.

## Routing

1. Read `references/command-map.md`.
2. Classify the request into one command route.
3. Resolve required mode from route.
4. If mode mismatch, return `MODE_MISMATCH` and stop.
5. Load only the matched reference file.
6. Produce output using that command's required format.
7. End with one explicit next command and next mode.

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
- If current mode does not meet route mode requirements, do not continue until mode is switched.
- For plan persistence in `build`/`check`, treat KFP API as required after health preflight.
- Client-facing command guidance must use `kfc` (not direct `kfp`), except package-internal docs.

## Mode Mismatch Policy

When current mode is incompatible, output:

- `Status: MODE_MISMATCH`
- `Required Mode: Plan|Build`
- `Current Mode: Plan|Build`
- `Reason: <one line>`
- `Instruction: Switch mode and rerun the same command.`

## Output Footer Contract

Every route output must end with:

- `Selected Mode: Plan|Build`
- `Mode Reason: <one line>`
- `Next Command: <start|plan|build|check|research|fix|done>`
- `Next Mode: Plan|Build|done`
