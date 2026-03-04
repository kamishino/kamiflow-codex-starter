# Codex Flow Smooth Guide

Use this guide to keep Kami Flow deterministic and easy to operate.

## Core Sequence

1. Resolve active non-done plan.
2. Choose exactly one route (`start|plan|build|check|fix|research`).
3. Execute one scoped slice.
4. Mutate plan frontmatter + `WIP Log`.
5. Respond with compact user guidance.

## Compact Response Shape

- `State`: current phase + status.
- `Doing`: what was executed in this slice.
- `Next`: one concrete action to run next.

## Evidence Rule

- Never claim implementation or validation success without evidence.
- Evidence comes from command output, repository files, or explicit user input.
- If evidence is missing, label the claim as `Unknown` and reroute to `research` or `plan`.

## Completion Safety

- `check` is complete only when archive succeeds.
- Do not treat plan as done if archive fails.
- On archive failure, keep active recovery path (`fix` or `plan`) and report the blocker explicitly.

## Recovery Shortcuts

- Missing/inconsistent plan: `kfc flow ensure-plan --project .`
- Build-readiness uncertainty: `kfc flow ready --project .`
- Shell/profile crash: rerun with no-profile/non-login shell.
- Runtime skill/rules drift: `npm run codex:sync -- --scope repo --force`
