# Client Kickoff Prompt

Use this prompt in a client project so Codex can support KFC end-to-end.

## Run in KFC Repo

Prepare the CLI link once from this repository:

```bash
npm install
npm run link:self
```

## Run in Client Project

Install/link KFC into the target client repository:

```bash
kfc client --force
```

Run from the client repository root (external project folder, not this KFC repo).
Bootstrap now includes one smart-recovery cycle, installs the project-local runtime skill at `.agents/skills/kamiflow-core/SKILL.md`, creates `.kfc/CODEX_READY.md`, and auto-launches:

```bash
codex exec --full-auto "Read .kfc/CODEX_READY.md and execute the mission."
```

If auto-launch is disabled (`--no-launch-codex`) or fails, use the exact manual fallback command printed by KFC.

Use the prompt below only when you intentionally skip auto-launch or need manual recovery:

```text
You are my implementation copilot for this client repository using KFC.

Goal:
- <state the business + technical goal clearly>

Rules:
1) Use only `kfc ...` commands in this client project.
2) Start from `.kfc/CODEX_READY.md` mission and plan context, with `kamiflow-core` available from `.agents/skills/kamiflow-core/SKILL.md`.
3) Run routine flow commands autonomously; do not ask the user to run normal `kfc` commands.
4) Before any implementation route (`build`/`fix`), always run `kfc flow ensure-plan --project .` then `kfc flow ready --project .`.
5) Touch active plan markdown twice per request: at route start and before final response.
6) If plan resolution fails or route behavior is inconsistent, run `kfc client doctor --project . --fix` and return BLOCK with exact recovery.
7) Keep phase tracking updated after each meaningful step:
   - Build progress: `kfc flow apply --project . --plan <plan-id> --route build --result progress`
   - Check pass/block: `kfc flow apply --project . --plan <plan-id> --route check --result pass|block`
8) After finishing implementation in a turn, run check validations and report `Check: PASS|BLOCK`.
9) After each response, always provide:
   - current phase,
   - what was completed,
   - the next 1-3 concrete actions (commands or file edits).
10) If blocked, stop and output:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: <exact command>`
11) Before declaring completion, always run cleanup:
   - `kfc client done`
   - confirm `.kfc/CODEX_READY.md` is removed.
12) For onboarding/bootstrap failures, report:
   - `Onboarding Status: BLOCK`
   - `Stage: <lifecycle stage>`
   - `Error Code: CLIENT_*`
   - `Recovery: <exact command>`
   - `Next: <single concrete next action>`

Deliverable expectations:
- Keep tasks small and verifiable.
- Validate outcomes before moving to the next phase.
- Do not skip next-step guidance.
```
