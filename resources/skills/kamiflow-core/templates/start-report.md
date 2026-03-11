# Start Report: <topic>

## Turn A: Clarifying Questions (Ask Only)
Q1. <question>
- A) <option 1>
- B) <option 2>
- C) <option 3>
- Other: <free text>

Q2. <question>
- A) <option 1>
- B) <option 2>
- C) <option 3>
- Other: <free text>

Q3. <question>
- A) <option 1>
- B) <option 2>
- C) <option 3>
- Other: <free text>

## Turn B: Decision Report (After Answers)

### Problem Frame
- Problem:
- Root causes:
- Design Surface:
- Non-goals:
- Target user:
- Success in 30 days:
- Constraints:

### Clarity Gate
- Clarity score (1-5):
- If score <= 3: ask follow-up questions before selecting options.
- If score >= 4: proceed to option selection.

### Solution Tracks (Scored)
1) Quick Win - Impact <1-5>, Feasibility <1-5>, Effort <1-5>, Confidence <1-5>, Total </20>, Verdict: Go|Maybe|Kill
2) Balanced - Impact <1-5>, Feasibility <1-5>, Effort <1-5>, Confidence <1-5>, Total </20>, Verdict: Go|Maybe|Kill
3) Ambitious - Impact <1-5>, Feasibility <1-5>, Effort <1-5>, Confidence <1-5>, Total </20>, Verdict: Go|Maybe|Kill

### Recommendations
- Best Solution: <Quick Win|Balanced|Ambitious + why>
- Tradeoffs: <what you gain vs what you accept>
- Runner-up option: <second-best + why>

### Pre-Mortem (Best Bet)
- Likely failure:
- Early warning:
- Mitigation:

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
- Immediate next command:

Run next: $kamiflow-core plan use START_CONTEXT, create/update target .local/plans/<file>.md directly to a decision-complete build-ready spec.

Plan lifecycle mutation:
- Resolve active non-done plan file first.
- Create plan file only when no active plan exists or scope split is explicit (`YYYY-MM-DD-<seq>-start.md`).
- Update frontmatter + `WIP Log` before response.

## Optional Response Handoff (Compact)
- Next step: <one line>
