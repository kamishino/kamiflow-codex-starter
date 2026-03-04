# Start

Use this route when the request is still fuzzy and needs direction.
The goal is to produce a high-quality shortlist plus a clean handoff to `plan`.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. First turn asks 3-5 clarifying questions only, then wait for answers.
2. Each question must include:
- 3 suggested answers
- 1 free-form `Other` option
3. After answers, generate 7-10 ideas:
- 2-3 safe
- 2-3 lateral
- 2-3 moonshot
4. Score each idea on 1-5:
- impact
- feasibility
- effort (5 is fastest/easiest)
5. Compute total score `/15` and classify:
- Go: 12-15
- Maybe: 8-11
- Kill: <8
6. Recommend top 3:
- Best Bet
- Dark Horse
- Quick Win
7. Add a pre-mortem for Best Bet.
8. Produce `START_CONTEXT` block for `plan` handoff:
- `topic`
- `target_user`
- `success_30d`
- `constraints`
- `selected_idea`
- `alternatives`
- `pre_mortem_risk`
- `handoff_confidence`
- `recommended_route`
   - include explicit block markers: `START_CONTEXT` and `END_START_CONTEXT`
9. Emit one exact `Run next:` command for `plan`.
   - ensure a new plan file is created for this request before final output.
   - use naming pattern: `YYYY-MM-DD-<seq>-start.md`.
10. Produce `Start Summary` fields for plan persistence:
- `Required: yes|no`
- `Reason`
- `Selected Idea`
- `Alternatives Considered`
- `Pre-mortem Risk`
- `Handoff Confidence`
11. End with one handoff route: `plan`, `build`, or `research`.
12. Include concise next-step guidance when useful; do not require verbose response footer fields.
13. Persist direct plan-file mutation before final output:
   - set frontmatter: `lifecycle_phase: start`, `selected_mode: Plan`, `next_command`, `next_mode`, `updated_at`
   - write `Start Summary` section
   - write `WIP Log` lines (`Status`, `Blockers`, `Next step`)

## Output

Use `../templates/start-report.md` shape.

## Exit Criteria

- First turn contains only questions with options.
- Final turn uses compact numbered idea cards (no wide markdown table).
- `START_CONTEXT` block is present.
- `Run next:` command is present and executable.
- Start Summary payload is complete and non-placeholder.
- One clear handoff route selected.
- A new request-scoped plan file is created before response completes.
- Handoff metadata is persisted in plan frontmatter.
