# Start

Use this route when the request is still fuzzy and needs direction.
The goal is to produce a high-quality shortlist plus a clean handoff to `plan`.
Treat this as the **Brainstorm phase**: analyze the problem, compare options, choose one best direction.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. First turn asks 3-5 clarifying questions only, then wait for answers.
2. Each question must include:
- 3 suggested answers
- 1 free-form `Other` option
3. After answers, write a concise **Problem Analysis**:
- core problem statement
- root causes (top 2-3)
- target user and constraints
4. Assign a **Clarity Score** (`1-5`) for problem understanding.
- `1-3`: still unclear -> ask follow-up clarification questions (do not finalize recommendations yet)
- `4-5`: clear enough -> continue to option design
5. Produce exactly 3 solution tracks:
- Quick Win
- Balanced
- Ambitious
6. Score each track on `1-5`:
- impact
- feasibility
- effort (5 is easiest/fastest)
- confidence
7. Compute total `/20` and label:
- Go: 16-20
- Maybe: 11-15
- Kill: <=10
8. Pick one **Best Solution** and provide rationale with key tradeoffs.
9. Add a pre-mortem for Best Solution.
10. Produce `START_CONTEXT` block for `plan` handoff:
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
11. Emit one exact `Run next:` command for `plan`.
   - resolve an active non-done plan before final output.
   - create a new plan file only when no active plan exists or scope must be split.
   - when creating: use naming pattern `YYYY-MM-DD-<seq>-start.md`.
12. Produce `Start Summary` fields for plan persistence:
- `Required: yes|no`
- `Reason`
- `Selected Idea`
- `Alternatives Considered`
- `Pre-mortem Risk`
- `Handoff Confidence`
13. Persist initial `Technical Solution Diagram` section in target plan markdown:
- heading must be `## Technical Solution Diagram`
- include one ```mermaid block that captures selected solution logic at high level
- do not leave the section missing when handoff route is `plan` or `build`
14. End with one handoff route: `plan`, `build`, or `research`.
15. Include concise next-step guidance when useful; do not require verbose response footer fields.
16. Persist direct plan-file mutation before final output:
   - set frontmatter: `lifecycle_phase: start`, `selected_mode: Plan`, `next_command`, `next_mode`, `updated_at`
   - write `Start Summary` section
   - write `Technical Solution Diagram` section with mermaid content
   - write `WIP Log` lines (`Status`, `Blockers`, `Next step`)

## Route Output Contract

- First turn: questions only (with options).
- Final turn: compact guidance shape:
  - `State`: clarity + route decision
  - `Doing`: analysis and scored options
  - `Next`: one exact `Run next:` command

## Evidence Contract

- Base recommendations on user answers and explicit constraints.
- If required context is missing, mark unresolved parts as `Unknown` and continue clarification instead of forcing a recommendation.

## Output

Use `../templates/start-report.md` shape.

## Exit Criteria

- First turn contains only questions with options.
- Final turn includes Problem Analysis + Clarity Score + exactly 3 tracks (Quick Win/Balanced/Ambitious).
- Final turn uses compact numbered option cards (no wide markdown table).
- `START_CONTEXT` block is present.
- `Run next:` command is present and executable.
- Start Summary payload is complete and non-placeholder.
- `Technical Solution Diagram` section exists with mermaid content before handoff.
- One clear handoff route selected.
- Active plan file is resolved (or created only when required) before response completes.
- Handoff metadata is persisted in plan frontmatter.
