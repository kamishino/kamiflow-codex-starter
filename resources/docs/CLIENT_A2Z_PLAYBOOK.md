# Client A-to-Z Playbook

This playbook standardizes how Codex supports a client project using KFC from setup to done.

## Run in KFC Repo

Maintainer-only preparation:

```bash
npm install
npm run link:self
```

## Run in Client Project

Client setup and execution:

```bash
npm link @kamishino/kamiflow-codex
npx --no-install kfc client bootstrap --project . --profile client
```

## Workflow Contract

1. Intake
- Confirm goal, scope, constraints, and acceptance criteria.
- If unclear, require clarification before implementation.

2. Environment and Plan Readiness
- Run `kfc client doctor --project .`.
- Run `kfc flow ensure-plan --project .`.
- Run `kfc plan validate --project .`.

3. Build Slice Loop
- Execute one task slice at a time.
- After each slice:
  - record progress with `kfc flow apply ... --route build --result progress`,
  - run validation commands for that slice.

4. Check Loop
- Evaluate results against acceptance criteria.
- Persist decision:
  - pass: `kfc flow apply ... --route check --result pass`
  - block: `kfc flow apply ... --route check --result block`

5. Next Action Discipline
- Always run `kfc flow next --project . --plan <plan-id> --style narrative`.
- Always provide the next 1-3 actionable steps.

6. Blocker Policy
- Stop and return:
  - `Status: BLOCK`
  - `Reason: <single concrete cause>`
  - `Recovery: <exact command>`

## Standard Client Entry

Use `resources/docs/CLIENT_KICKOFF_PROMPT.md` as the default first message to Codex in any client project.
