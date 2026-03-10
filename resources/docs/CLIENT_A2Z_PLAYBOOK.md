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
```

Run those commands from the client repository root (external project folder, not this KFC repo).
KFC now inspects the target repo first. If the target folder is truly empty, KFC auto-initializes a minimal `package.json` first. This creates a root `AGENTS.md` managed contract, installs the project-local runtime skill at `.agents/skills/kamiflow-core/SKILL.md`, generates `.kfc/CODEX_READY.md` for Codex handoff, scaffolds private lessons at `.kfc/LESSONS.md` plus `.local/kfc-lessons/`, and auto-launches Codex by default.
Client bootstrap includes one smart-recovery cycle and prints `Inspection Status`, `Repo Shape`, `Apply Mode`, `Planned Changes`, plus `Onboarding Status: PASS|BLOCK`, `Stage: ...`, `Error Code: CLIENT_*`, `Recovery: ...`, and `Next: ...`.
If auto-launch is disabled or fails, use the exact manual fallback command printed by KFC.
Treat the root `AGENTS.md` managed block as KFC's project-specific `/init` contract. KFC refreshes that block during `kfc client` and `kfc client update` while preserving notes outside it.

## Workflow Contract

1. Intake
- Confirm goal, scope, constraints, and acceptance criteria.
- If unclear, require clarification before implementation.

2. Environment and Plan Readiness
- Read `AGENTS.md` first as the stable client-repo operating contract and KFC-owned `/init` equivalent.
- Use `.kfc/CODEX_READY.md` as mission + plan contract.
- Use `.kfc/LESSONS.md` as curated private project memory when present.
- Use `.agents/skills/kamiflow-core/SKILL.md` as the visible project-local runtime skill artifact.
- Keep raw lesson history private under `.local/kfc-lessons/`.
- Use `kfc client lessons capture|pending|show|promote|list` to maintain the private-history -> curated-memory lesson flow.
- Codex should execute routine flow commands autonomously without user reminders.
- Auto-launch is the preferred handoff path; use the printed fallback command only if launch was skipped or failed.
- Respect the inspection contract: `risky` repos should BLOCK before mutation, while `ready` and `needs_minor_fixes` can continue automatically.
- Treat onboarding PASS as environment-ready only. If the active plan is still draft, Codex should complete Brainstorm/Plan first.
- Before any implementation route (`build`/`fix`), Codex should confirm the active plan is build-ready, then run `kfc flow ready --project .`.
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
- Keep `.kfc/LESSONS.md` for future sessions.
- Do not mark complete before cleanup succeeds.

## Standard Client Entry

Use `resources/docs/CLIENT_KICKOFF_PROMPT.md` as the default first message to Codex in any client project.
