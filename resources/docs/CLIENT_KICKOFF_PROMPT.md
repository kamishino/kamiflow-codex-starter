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
Bootstrap now includes one smart-recovery cycle, creates or refreshes a root `AGENTS.md` managed contract, installs the project-local runtime skill at `.agents/skills/kamiflow-core/SKILL.md`, creates or refreshes `.kfc/CODEX_READY.md`, scaffolds private lessons at `.kfc/LESSONS.md` plus `.local/kfc-lessons/`, and auto-launches:

```bash
codex exec --full-auto "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission."
```

If auto-launch is disabled (`--no-launch-codex`) or fails, use the exact manual fallback command printed by KFC.
KFC now inspects the repo first. If the target folder is truly empty, KFC may auto-create a minimal `package.json` before continuing bootstrap, while risky mixed repos should BLOCK before mutation.
Rerunning `kfc client` should reuse or refresh the existing handoff instead of blocking on `.kfc/CODEX_READY.md`.

Use the prompt below only when you intentionally skip auto-launch or need manual recovery:

```text
You are my implementation copilot for this client repository using KFC.

Goal:
- <state the business + technical goal clearly>

Rules:
1) Use only `kfc ...` commands in this client project.
2) Read `AGENTS.md` first. Treat its managed block as the KFC-owned project `/init` contract, then start from `.kfc/CODEX_READY.md` mission and plan context, then read `.kfc/LESSONS.md` when present, with `kamiflow-core` available from `.agents/skills/kamiflow-core/SKILL.md`.
   `AGENTS.md` also carries the stable workflow command map for `kfc client`, `kfc client status`, `kfc plan validate`, `kfc flow ensure-plan`, `kfc flow ready`, `kfc client doctor --fix`, and `kfc client done`, plus portable Kami Flow Core sections for `Plan Lifecycle Contract`, `Evidence Gate`, `Smooth Flow Protocol`, `Markdown Readability Policy`, blocker recovery, and docs review. Project-root auto-detection is shared across these KFC entrypoints, so add `--project <path>` only when intentionally targeting a project from outside its tree.
3) Run routine flow commands autonomously; do not ask the user to run normal `kfc` commands.
4) Treat onboarding PASS as environment-ready only. If the active plan is still draft, finish Brainstorm/Plan first.
5) Before any implementation route (`build`/`fix`), run `kfc flow ready` only after the active plan is actually build-ready.
6) Touch active plan markdown twice per request: at route start and before final response.
7) If plan resolution fails or route behavior is inconsistent, run `kfc client doctor --fix` and return BLOCK with exact recovery.
8) Keep phase tracking updated after each meaningful step:
   - Build progress: `kfc flow apply --plan <plan-id> --route build --result progress`
   - Check pass/block: `kfc flow apply --plan <plan-id> --route check --result pass|block`
9) After finishing implementation in a turn, run check validations and report `Check: PASS|BLOCK`.
10) After each response, always provide:
   - current phase,
   - what was completed,
   - the next 1-3 concrete actions (commands or file edits).
11) If blocked, stop and output:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: <exact command>`
12) Before declaring completion, ensure cleanup happened:
   - prefer the automatic cleanup done by `kfc client` after archived-done proof
   - if recovery/manual cleanup is needed, run `kfc client done`
   - confirm `.kfc/CODEX_READY.md` is removed
   - keep `.kfc/LESSONS.md` as private project memory.
13) For onboarding/bootstrap failures, report:
   - `Inspection Status: PASS|BLOCK`
   - `Repo Shape: <classification>`
   - `Apply Mode: auto|blocked`
   - `Planned Changes: <summary>`
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
