# Build

Use this route to execute an approved plan in small, verifiable slices.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.
- Implementation must not proceed until a concrete target plan file is resolved.
- Require an approved plan before execution:
  - `decision: GO`
  - `next_command: build`
  - `next_mode: Build`
  - Start Summary gate is satisfied
  - no unresolved high-impact open decisions
- If approval gates fail, stop and reroute to `plan` (or `start` when clarity is insufficient, or `research` when scope/risk is unclear).

## Steps

1. Resolve target plan file before any implementation using this order:
   1. user-provided file path or plan id
   2. active non-done plan
   3. create a new plan file directly from template only when no active plan exists or scope split is explicit
2. If no target file can be resolved, return:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: create .local/plans/<date-seq>-build.md from template`
   - `Expected: plan markdown exists and is writable`
3. Run readiness gate before implementation:
   - evaluate build-ready criteria directly from plan markdown (`decision`, handoff, open decisions, tasks, acceptance criteria, validation commands).
4. If readiness gate fails, return:
   - `Status: BLOCK`
   - `Reason: plan is not build-ready`
   - `Recovery: update plan via `$kamiflow-core plan` and rerun build`
   - `Expected: readiness gates pass in plan markdown`
5. Confirm required plan or scope exists and map to the resolved plan file.
6. Follow `diagram_mode` before implementing:
   - `required`: ensure `Technical Solution Diagram` section exists with Mermaid content.
   - `auto|hidden`: Technical section is optional; keep Tasks/Subtasks updated for fallback UX.
   - if a Technical section already exists, keep it synchronized when solution path changes.
7. Select one concrete task slice from the plan.
   - Build/Fix scope is `Implementation Tasks` only.
   - Do not mark `Acceptance Criteria` complete in build unless explicitly converting validated evidence from check route.
8. List exact file-level actions before implementation.
9. Implement in small logical steps.
10. Run targeted checks relevant to changed areas.
11. Summarize what changed and why.
12. Persist build phase/progress via direct markdown mutation:
   - frontmatter: `lifecycle_phase: build`, `selected_mode: Build`, `next_command: check`, `next_mode: Plan`, `updated_at`
   - sections: keep `Technical Solution Diagram` synchronized when `diagram_mode: required` (or when present)
   - `WIP Log`: `Status`, `Blockers`, `Next step`
   - evidence: map validation outcomes to task entries and/or WIP evidence line
   - during multi-step implementation, after each completed task/subtask update checklist + timestamped WIP evidence before the next subtask
13. If evidence is missing for any claim, mark the claim as `Unknown` and do not assert completion.
14. Before final response, run check validations for the implemented slice and report `Check: PASS|BLOCK` with evidence.
15. Resolve next-step narrative from mutated frontmatter and remaining checklist state.
   - if remaining completion is below 100%, keep `next_command: check` and carry unresolved checklist context in WIP.
16. End with concise next-step guidance; do not require verbose response footer fields.
17. Final response should use compact guidance shape:
   - `State`: active phase + task status
   - `Doing`: implemented slice and validations run
   - `Next`: one concrete next action (normally `check`)

## Route Output Contract

- Return compact guidance shape with:
  - `State`
  - `Doing`
  - `Next`
- Include explicit `Check: PASS|BLOCK` with evidence before final response.

## Evidence Contract

- Implementation completion claims must cite command output and/or changed file evidence.
- Missing validation evidence must be labeled `Unknown` (no implicit success claims).

## Output

Provide:

- planned changes
- executed changes
- validation run list
- known limitations

## Exit Criteria

- Changes align with scope.
- Validation commands are listed with outcomes.
- Work done maps to explicit task(s) in the plan.
- A concrete target plan file is resolved before execution begins.
- Readiness gate in markdown passes before implementation starts.
- Build action is blocked when Start Summary gate is not satisfied.
- Technical Solution Diagram requirement is enforced only when `diagram_mode: required`.
- Claims are evidence-backed or explicitly marked `Unknown`.
- Plan file is mutated directly before response is returned.
- Handoff metadata is persisted in plan frontmatter.
