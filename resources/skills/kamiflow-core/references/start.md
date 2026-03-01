# Start

Use this route to convert a vague idea into a ranked shortlist and produce handoff-ready Start Context for `plan`.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. First turn must ask 3-5 clarifying questions only and wait for user answers.
2. Each question must provide:
- 3 suggested answers
- 1 free-form `Other` option
3. After answers are provided, generate 7-10 ideas:
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
7. Add pre-mortem for Best Bet.
8. Produce `START_CONTEXT` block for plan handoff:
- `topic`
- `target_user`
- `success_30d`
- `constraints`
- `selected_idea`
- `alternatives`
- `pre_mortem_risk`
- `handoff_confidence`
- `recommended_route`
9. Emit one exact `Run next:` command that invokes `plan` with `START_CONTEXT`.
   - The command must include plan-file bootstrap instruction:
     - ensure file exists via `kfc plan init --project <path> --new` when no target file is provided.
10. Produce `Start Summary` fields for plan persistence:
- `Required: yes|no`
- `Reason`
- `Selected Idea`
- `Alternatives Considered`
- `Pre-mortem Risk`
- `Handoff Confidence`
11. End with one handoff route: `plan`, `build`, or `research`.

## Output

Use `../templates/start-report.md` shape.

## Exit Criteria

- First turn contains only questions with options.
- Final turn uses compact numbered idea cards (no wide markdown table).
- `START_CONTEXT` block is present.
- `Run next:` command is present and executable.
- Start Summary payload is complete and non-placeholder.
- One clear handoff route selected.
- Final footer includes selected mode and next mode.
