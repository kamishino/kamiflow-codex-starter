# Start

Use this route when the request is still fuzzy and needs direction.
The goal is to produce a high-quality shortlist plus a clean handoff to `plan`.
Treat this as the **Brainstorm phase**: analyze the problem, compare options, choose one best direction.

When the user explicitly asks for **simple**, **quick**, or **pre-brainstorm** mode, follow the compact path:
- ask only 2-3 clarifying questions on turn A.
- prioritize speed and direction confidence over exhaustive scoping.
- keep handoff output intentionally short and concrete.
- still emit exactly 3 tracks and full `START_CONTEXT` for plan handoff.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.
- Route confidence for `start` must be `>=4` before execution.
- If route confidence is `<4`, return `Status: REROUTE` with fallback route (`start|plan|research`) and stop.

## Steps

1. If `IDEATION_CONTEXT` is present from prior `research`, consume it directly and skip duplicate discovery questions.
2. If no `IDEATION_CONTEXT` is available, first turn asks 3-5 clarifying questions only, then wait for answers.
3. If the request is architecture-heavy, cross-product, or clearly broad, ask 1-2 scoped boundary questions first and keep the first turn question-only.
4. Each question must include:
- 3 suggested answers
- 1 free-form `Other` option
5. After answers (or after consuming `IDEATION_CONTEXT`), write a concise **Problem Analysis**:
- core problem statement
- if in `simple` mode, keep this to one short paragraph.
- root causes (top 2-3)
- target user and constraints
6. Assign a **Clarity Score** (`1-5`) for problem understanding.
- `1-3`: still unclear -> ask follow-up clarification questions (do not finalize recommendations yet)
- `4-5`: clear enough -> continue to option design
7. Produce exactly 3 solution tracks:
- Quick Win
- Balanced
- Ambitious
8. Score each track internally on `1-5`:
- impact
- feasibility
- effort (5 is easiest/fastest)
- confidence
9. Convert the internal total (`/20`) into one visible `Total Score` on `/10`, rounded to one decimal place. Do not show the internal sub-scores in the final user-facing output unless the user explicitly asks for them.
10. Map the visible `Total Score` to default recommendation language:
- `9.0-10.0` -> `Do now`
- `8.0-8.9` -> `Strong next bet`
- `7.0-7.9` -> `Good, but not urgent`
- `<7.0` -> `Later / only if strategy changes`
11. Assign one `MoSCoW` bucket (`Must|Should|Could|Won't for now`) to each track based on urgency, dependency criticality, and near-term product value.
12. Present the 3 tracks as ranked PM-style recommendation cards with:
- `Rank`
- `Idea`
- `Total Score`
- `MoSCoW`
- `Recommendation`
- `Why now`
- Keep the explanation natural-language and decision-friendly; avoid wide tables and visible sub-score math by default.
13. Pick one **Best Solution** and provide rationale with key tradeoffs.
14. Add a short PM takeaway that clearly says what to build first, second, and third when a ranked sequence would help the decision.
15. Add a pre-mortem for Best Solution.
16. For complex or architecture-sensitive requests, include a one-line Design Surface note before handoff and avoid hard design commitments on the same turn.
17. Produce `START_CONTEXT` block for `plan` handoff:
- `topic`
- `target_user`
- `success_30d`
- `constraints`
- `start_mode` (`full` | `simple`)
- `selected_idea`
- `alternatives`
- `pre_mortem_risk`
- `handoff_confidence`
- `recommended_route`
- include explicit block markers: `START_CONTEXT` and `END_START_CONTEXT`
18. Emit one exact `Run next:` command for `plan`.
   - resolve an active non-done plan before final output.
   - create a new plan file only when no active plan exists or scope must be split.
   - when creating: use naming pattern `YYYY-MM-DD-<seq>-start.md`.
19. Produce `Start Summary` fields for plan persistence:
- `Required: yes|no`
- `Reason`
- `Selected Idea`
- `Alternatives Considered`
- `Pre-mortem Risk`
- `Handoff Confidence`
20. Run Diagram Need Decision immediately after user answers (or IDEATION_CONTEXT ingestion):
- if chosen solution needs architecture/flow explanation, mark diagram as needed.
- if needed, set `diagram_mode: required` and make sure Mermaid content is written in plan markdown.
- if not needed, set `diagram_mode: auto` (or `hidden` only when explicitly requested).
21. Persist `diagram_mode` in target plan markdown and apply policy:
- set `diagram_mode: required|auto|hidden`
- when `required`, include `## Technical Solution Diagram` with one ```mermaid block that captures selected solution logic
- Mermaid safety: avoid raw `|` in node labels; use `/` or `or` in label text
- when `auto|hidden`, Technical section may be omitted (KFC Plan falls back to Tasks/Subtasks)
22. End with one handoff route: `plan`, `build`, or `research`.
23. Include concise next-step guidance when useful; do not require verbose response footer fields.
24. Persist direct plan-file mutation before final output:
   - set frontmatter: `lifecycle_phase: start`, `selected_mode: Plan`, `next_command`, `next_mode`, `updated_at`
   - write `Start Summary` section
   - when `diagram_mode: required`, write `Technical Solution Diagram` section with mermaid content
   - write `WIP Log` lines (`Status`, `Blockers`, `Next step`)

## Route Output Contract

- First turn:
  - if `IDEATION_CONTEXT` exists: concise context confirmation + proceed to ranked PM-style options.
  - otherwise: questions only (with options).
- Final turn: compact guidance shape:
  - `State`: clarity + route decision
  - `Doing`: analysis and ranked PM-style options
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
- Final turn uses compact numbered PM-style option cards (no wide markdown table).
- Final turn includes `Total Score`, `MoSCoW`, `Recommendation`, and `Why now` for each ranked track.
- Final turn does not show visible impact/feasibility/effort/confidence sub-score math by default.
- `START_CONTEXT` block is present.
- `Run next:` command is present and executable.
- Start Summary payload is complete and non-placeholder.
- Technical Solution Diagram content exists before handoff when `diagram_mode: required`.
- One clear handoff route selected.
- Active plan file is resolved (or created only when required) before response completes.
- Handoff metadata is persisted in plan frontmatter.
