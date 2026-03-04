# Research

Use this route when missing facts or high risk would make execution unsafe.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. State the open questions blocking implementation.
2. Gather evidence from repo and primary documentation.
3. Compare viable options with tradeoffs.
4. Mark unknown claims as `Unknown` when evidence is insufficient; do not guess.
5. Recommend one option with rationale.
6. Persist handoff phase by direct markdown mutation:
   - set frontmatter: `lifecycle_phase: research`, `selected_mode: Plan`, `next_command`, `next_mode`, `updated_at`
   - update `WIP Log` lines (`Status`, `Blockers`, `Next step`)
7. Resolve next-step narrative from mutated state.
8. End with concise next-step guidance; do not require verbose response footer fields.

## Output

Provide:

- question list
- evidence summary
- option comparison
- recommended direction

## Exit Criteria

- Unknowns are reduced enough to continue with plan.
- Unknown claims are explicitly labeled `Unknown`.
- Plan file is mutated directly before response is returned.
- Handoff metadata is persisted in plan frontmatter.
