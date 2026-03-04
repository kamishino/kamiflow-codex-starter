# Start Report: <topic>

## Turn A: Clarifying Questions (Ask Only)

Q1. <question>
- A) <suggested option 1>
- B) <suggested option 2>
- C) <suggested option 3>
- Other: <free text>

Q2. <question>
- A) <suggested option 1>
- B) <suggested option 2>
- C) <suggested option 3>
- Other: <free text>

Q3. <question>
- A) <suggested option 1>
- B) <suggested option 2>
- C) <suggested option 3>
- Other: <free text>

Q4. <question> (optional)
- A) <suggested option 1>
- B) <suggested option 2>
- C) <suggested option 3>
- Other: <free text>

Q5. <question> (optional)
- A) <suggested option 1>
- B) <suggested option 2>
- C) <suggested option 3>
- Other: <free text>

## Turn B: Decision Report (After Answers)

### Problem Frame
- Problem:
- Target user:
- Success in 30 days:
- Constraints:
- Deal-breakers:

### Idea Set
- Total ideas generated: <N>
- Mix: Safe <n>, Lateral <n>, Moonshot <n>

### Scored Ideas (Top 5, Numbered Cards)
1) <idea name>
- Type: Safe | Lateral | Moonshot
- Impact: <1-5>
- Feasibility: <1-5>
- Effort: <1-5> (5 is fastest/easiest)
- Total: </15>
- Verdict: Go | Maybe | Kill
- Why it matters:

2) <idea name>
- Type:
- Impact:
- Feasibility:
- Effort:
- Total:
- Verdict:
- Why it matters:

3) <idea name>
- Type:
- Impact:
- Feasibility:
- Effort:
- Total:
- Verdict:
- Why it matters:

4) <idea name>
- Type:
- Impact:
- Feasibility:
- Effort:
- Total:
- Verdict:
- Why it matters:

5) <idea name>
- Type:
- Impact:
- Feasibility:
- Effort:
- Total:
- Verdict:
- Why it matters:

### Recommendations
Best Bet:
- Why:
- First step:
- Main risk:

Dark Horse:
- Why:
- Trigger condition:
- Main risk:

Quick Win:
- Why:
- First step:
- Main risk:

### Pre-Mortem (Best Bet)
- If this fails in 30 days, most likely reason:
- Early warning signal:
- Mitigation now:

### START_CONTEXT
START_CONTEXT
- topic:
- target_user:
- success_30d:
- constraints:
- selected_idea:
- alternatives:
- pre_mortem_risk:
- handoff_confidence: <1-5>
- recommended_route: plan | build | research
END_START_CONTEXT

### Start Summary
- Required: yes|no
- Reason:
- Selected Idea:
- Alternatives Considered:
- Pre-mortem Risk:
- Handoff Confidence:

### Handoff Decision
- Selected idea:
- Route: plan | build | research
- Reason:
- Immediate next command:

Run next: $kamiflow-core plan use START_CONTEXT, create/update target .local/plans/<file>.md directly to a decision-complete build-ready spec.

Plan lifecycle mutation:
- Create request-scoped plan file using `YYYY-MM-DD-<seq>-start.md`.
- Set frontmatter fields: `request_id`, `parent_plan_id` (if any), `lifecycle_phase: start`, `updated_at`.
- Update `WIP Log` before response.

## Mode
- Selected Mode: Plan
- Mode Reason:
- Next Action:
- Next Command:
- Next Mode: Plan | Build
