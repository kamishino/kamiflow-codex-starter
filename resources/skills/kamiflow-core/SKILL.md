---
name: kamiflow-core
description: Core Kami Flow workflow router for start, plan, build, check, research, and fix execution. Use when users ask to start an idea, plan work, build changes, check quality, research unknowns, or fix targeted issues in a consistent project workflow.
---

# Kami Flow Core

Use this as the default workflow router for non-trivial work.
It helps you choose the right route, enforce mode discipline, and finish with a clear next step.

## Mode Selector

Pick mode before executing route logic:

- `start` -> `Plan`
- `plan` -> `Plan`
- `research` -> `Plan`
- `build` -> `Build`
- `fix` -> `Build`
- `check` -> `Plan` by default; use `Build` only when running commands/tests or proposing file edits.

## Routing Workflow

1. Read `references/command-map.md`.
2. Classify the request into exactly one route.
3. Resolve the required mode from that route.
4. If mode is incompatible, return `MODE_MISMATCH` and stop.
5. Load only the matched route reference file.
6. Produce output in that route's required shape.
7. End with one explicit next command and next mode.

## Command Routes

- `start` -> `references/start.md`
- `plan` -> `references/plan.md`
- `build` -> `references/build.md`
- `check` -> `references/check.md`
- `research` -> `references/research.md`
- `fix` -> `references/fix.md`

## Global Rules

- Keep output concise, structured, and human-readable.
- No emoji in default output.
- Do not skip required gates in the selected route reference.
- If scope or risk increases, route back to `research` or `plan`.
- If mode does not satisfy route requirements, do not continue.
- For plan persistence in `build`/`check`, treat KFP API checks as required after health preflight.
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
- `Next Action: <one narrative line>`
- `Next Command: <start|plan|build|check|research|fix|done>`
- `Next Mode: Plan|Build|done`