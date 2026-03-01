# Start

Use this route to convert a vague idea into a ranked shortlist.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. Ask 3-5 clarifying questions and wait for answers.
2. Generate 7-10 ideas:
- 2-3 safe
- 2-3 lateral
- 2-3 moonshot
3. Score each idea on 1-5:
- impact
- feasibility
- effort (5 is fastest/easiest)
4. Compute total score `/15` and classify:
- Go: 12-15
- Maybe: 8-11
- Kill: <8
5. Recommend top 3:
- Best Bet
- Dark Horse
- Quick Win
6. Add pre-mortem for Best Bet.
7. End with one handoff route: `plan`, `build`, or `research`.

## Output

Use `../templates/start-report.md` shape.

## Exit Criteria

- Top 5 scoring table present.
- One clear handoff route selected.
- Final footer includes selected mode and next mode.
