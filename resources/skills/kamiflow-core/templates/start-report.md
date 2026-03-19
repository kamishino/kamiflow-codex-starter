# Start Report: <topic>

## Turn A: Clarifying Questions (Ask Only)
- Simple mode: if requested, keep to 2-3 high-signal questions and move to Turn B on the next message.

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
- Start mode: <full | simple>
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

### Ranked Recommendation Cards
1) Quick Win
- Total Score: <0.0-10.0>
- MoSCoW: Must|Should|Could|Won't for now
- Recommendation: Do now|Strong next bet|Good, but not urgent|Later / only if strategy changes
- Why now: <one short PM rationale>

2) Balanced
- Total Score: <0.0-10.0>
- MoSCoW: Must|Should|Could|Won't for now
- Recommendation: Do now|Strong next bet|Good, but not urgent|Later / only if strategy changes
- Why now: <one short PM rationale>

3) Ambitious
- Total Score: <0.0-10.0>
- MoSCoW: Must|Should|Could|Won't for now
- Recommendation: Do now|Strong next bet|Good, but not urgent|Later / only if strategy changes
- Why now: <one short PM rationale>

### Recommendations
- Best Solution: <Quick Win|Balanced|Ambitious + why>
- Tradeoffs: <what you gain vs what you accept>
- Runner-up option: <second-best + why>

### PM Takeaway
- Build first:
- Build second:
- Build third:

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
- start_mode: <full | simple>
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
