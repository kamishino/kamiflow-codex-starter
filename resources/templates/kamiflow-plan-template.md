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
  2. active draft/ready plan
  3. `kfc flow ensure-plan --project <path>`

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
  - `Recovery: kfc flow ensure-plan --project <path>`
  - `Expected: {"ok":true,"plan_path":"<absolute-path>",...}`
