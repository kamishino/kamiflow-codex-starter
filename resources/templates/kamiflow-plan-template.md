# Kami Flow PLAN Request

Target plan file:
- `.local/plans/<YYYY-MM-DD-xxx-topic>.md`

Goal:
- <one clear objective>

Scope:
- In: <files/modules>
- Out: <explicit exclusions>

Constraints:
- <JS/TS only, no API break, performance/security limits, etc.>

Request:
- Produce a decision-complete implementation plan.
- If `START_CONTEXT` is provided, consume it directly.
- Resolve target plan file in this order:
  1. user-provided file path
  2. request-scoped plan file (`YYYY-MM-DD-<seq>-plan.md`)
  3. active non-done plan
  4. create plan from template if missing

Output requirements:
- Concrete file-level tasks.
- Testable acceptance criteria.
- Runnable validation commands.
- Risks and rollback strategy.
- Build-ready handoff metadata:
  - `decision: GO`
  - `next_command: build`
  - `next_mode: Build`

Blocking behavior:
- If plan file cannot be resolved, return:
  - `Status: BLOCK`
  - `Reason: <single concrete cause>`
  - `Recovery: create .local/plans/<date-seq>-plan.md from template`
  - `Expected: plan markdown exists and is writable`
