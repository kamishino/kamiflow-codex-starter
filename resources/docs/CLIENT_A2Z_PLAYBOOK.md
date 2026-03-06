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
kfc client --force
kfc client doctor --project . --fix
```

Run those commands from the client repository root (external project folder, not this KFC repo).
This generates `.kfc/CODEX_READY.md` for Codex handoff.
Client bootstrap includes one smart-recovery cycle and prints `Onboarding Status: PASS|BLOCK`, `Stage: ...`, `Error Code: CLIENT_*`, `Recovery: ...`, and `Next: ...`.

## Workflow Contract

1. Intake
- Confirm goal, scope, constraints, and acceptance criteria.
- If unclear, require clarification before implementation.

2. Environment and Plan Readiness
- Use `.kfc/CODEX_READY.md` as mission + plan contract.
- Codex should execute routine flow commands autonomously without user reminders.
- Before any implementation route (`build`/`fix`), run `kfc flow ensure-plan --project .` and `kfc flow ready --project .`.
- Touch active plan markdown at route start and before final response.
- If route behavior looks inconsistent, run `kfc client doctor --project . --fix`.
- If needed, rerun `kfc client --force`.
- For onboarding/bootstrap block states, always follow the printed `Recovery:` command and keep the `Error Code` in your report.

3. Build Slice Loop
- Execute one task slice at a time.
- After each slice:
  - record progress with `kfc flow apply ... --route build --result progress`,
  - run validation commands for that slice,
  - run check validations and report `Check: PASS|BLOCK` before final response.

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

7. Finish Policy (Required)
- Run `kfc client done`.
- Confirm `.kfc/CODEX_READY.md` was removed.
- Do not mark complete before cleanup succeeds.

## Standard Client Entry

Use `resources/docs/CLIENT_KICKOFF_PROMPT.md` as the default first message to Codex in any client project.
