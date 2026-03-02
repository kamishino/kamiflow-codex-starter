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
npm link @kamishino/kamiflow-codex
npx --no-install kfc client bootstrap --project . --profile client
```

Then paste this prompt into Codex:

```text
You are my implementation copilot for this client repository using KFC.

Goal:
- <state the business + technical goal clearly>

Rules:
1) Use only `kfc ...` commands in this client project.
2) Start by confirming project readiness using:
   - `kfc client doctor --project .`
3) Ensure a plan exists using:
   - `kfc flow ensure-plan --project .`
4) Keep phase tracking updated after each meaningful step:
   - Build progress: `kfc flow apply --project . --plan <plan-id> --route build --result progress`
   - Check pass/block: `kfc flow apply --project . --plan <plan-id> --route check --result pass|block`
5) After each response, always provide:
   - current phase,
   - what was completed,
   - the next 1-3 concrete actions (commands or file edits).
6) If blocked, stop and output:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: <exact command>`

Deliverable expectations:
- Keep tasks small and verifiable.
- Validate outcomes before moving to the next phase.
- Do not skip next-step guidance.
```
