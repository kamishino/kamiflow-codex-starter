# Skills (SSOT)

This folder is the source of truth for Codex skills used by Kami Flow.

## What lives here

- `kamiflow-core/`: the main workflow router skill with Plan/Build mode gates.

## Why this matters

Codex loads generated runtime skills from `.agents/skills`, but those are build artifacts.
Edit skill content only in `resources/skills`.

## Editing rules

- Keep machine-critical contracts intact (mode mismatch fields, START_CONTEXT markers, plan lifecycle metadata fields).
- You can improve tone and readability, but do not change route behavior.
- After edits, sync runtime skills from SSOT and run validation checks.
