# Start

Use this route when the request is still fuzzy and needs direction.
The goal is to produce a high-quality shortlist plus a clean handoff to `plan`.
Treat this as the **Brainstorm phase**: analyze the problem, compare options, choose one best direction.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.
- Route confidence for `start` must be `>=4` before execution.
- If route confidence is `<4`, return `Status: REROUTE` with fallback route (`start|plan|research`) and stop.

## Steps

1. If `IDEATION_CONTEXT` is present from prior `research`, consume it directly and skip duplicate discovery questions.
2. If no `IDEATION_CONTEXT` is available, first turn asks 3-5 clarifying questions only, then wait for answers.
3. Each question must include:
- 3 suggested answers
- 1 free-form `Other` option
4. After answers (or after consuming `IDEATION_CONTEXT`), write a concise **Problem Analysis**:
- core problem statement
- root causes (top 2-3)
- target user and constraints
5. Assign a **Clarity Score** (`1-5`) for problem understanding.
- `1-3`: still unclear -> ask follow-up clarification questions (do not finalize recommendations yet)
- `4-5`: clear enough -> continue to option design
6. Produce exactly 3 solution tracks:
- Quick Win
- Balanced
- Ambitious
7. Score each track on `1-5`:
- impact
- feasibility
- effort (5 is easiest/fastest)
- confidence
8. Compute total `/20` and label:
- Go: 16-20
- Maybe: 11-15
- Kill: <=10
9. Pick one **Best Solution** and provide rationale with key tradeoffs.
10. Add a pre-mortem for Best Solution.
11. Produce `START_CONTEXT` block for `plan` handoff:
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
12. Emit one exact `Run next:` command for `plan`.
   - resolve an active non-done plan before final output.
   - create a new plan file only when no active plan exists or scope must be split.
   - when creating: use naming pattern `YYYY-MM-DD-<seq>-start.md`.
13. Produce `Start Summary` fields for plan persistence:
- `Required: yes|no`
- `Reason`
- `Selected Idea`
- `Alternatives Considered`
- `Pre-mortem Risk`
- `Handoff Confidence`
14. Run Diagram Need Decision immediately after user answers (or IDEATION_CONTEXT ingestion):
- if chosen solution needs architecture/flow explanation, mark diagram as needed.
- if needed, set `diagram_mode: required` and make sure Mermaid content is written in plan markdown.
- if not needed, set `diagram_mode: auto` (or `hidden` only when explicitly requested).
15. Persist `diagram_mode` in target plan markdown and apply policy:
- set `diagram_mode: required|auto|hidden`
- when `required`, include `## Technical Solution Diagram` with one ```mermaid block that captures selected solution logic
- Mermaid safety: avoid raw `|` in node labels; use `/` or `or` in label text
- when `auto|hidden`, Technical section may be omitted (KFC Plan falls back to Tasks/Subtasks)
16. End with one handoff route: `plan`, `build`, or `research`.
17. Include concise next-step guidance when useful; do not require verbose response footer fields.
18. Persist direct plan-file mutation before final output:
   - set frontmatter: `lifecycle_phase: start`, `selected_mode: Plan`, `next_command`, `next_mode`, `updated_at`
   - write `Start Summary` section
   - when `diagram_mode: required`, write `Technical Solution Diagram` section with mermaid content
   - write `WIP Log` lines (`Status`, `Blockers`, `Next step`)

## Route Output Contract

- First turn:
  - if `IDEATION_CONTEXT` exists: concise context confirmation + proceed to scored options.
  - otherwise: questions only (with options).
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

- First turn contains only questions with options when `IDEATION_CONTEXT` is absent.
- If `IDEATION_CONTEXT` exists, start route must consume it and avoid duplicate baseline questions.
- Final turn includes Problem Analysis + Clarity Score + exactly 3 tracks (Quick Win/Balanced/Ambitious).
- Final turn uses compact numbered option cards (no wide markdown table).
- `START_CONTEXT` block is present.
- `Run next:` command is present and executable.
- Start Summary payload is complete and non-placeholder.
- Technical Solution Diagram content exists before handoff when `diagram_mode: required`.
- One clear handoff route selected.
- Active plan file is resolved (or created only when required) before response completes.
- Handoff metadata is persisted in plan frontmatter.

