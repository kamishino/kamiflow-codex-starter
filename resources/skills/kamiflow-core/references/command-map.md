# Command Map

Use this map to execute the inferred route and the right recovery command.

Client repos are the default target. Treat the kamiflow-core source repo as the source-repo exception, and keep the source-only forward-test bundle and maintainer checks there.

## Install Or Repair

- First install or refresh:
  - `npx --package @kamishino/kamiflow-core kamiflow-core install --project .`
  - writes `.agents/skills/kamiflow-core/install-meta.json`, preserves existing `AGENTS.md` and `.local/project.md`, and creates the generated client `AGENTS.md` only when the repo does not already own one
- In the kamiflow-core source repo, use:
  - `npm run skill:sync`
  - refreshes the full source-repo runtime and rewrites the runtime metadata as the source-repo sync profile
- Recover missing active plan or runtime project brief:
  - `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`
- Check build readiness:
  - `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .`
- Archive completed PASS work:
  - `node .agents/skills/kamiflow-core/scripts/archive-plan.mjs --project . --plan <path>`
- Inspect the correct finish action:
  - `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .`
  - returns the helper-backed recommendation for `commit-only`, `release-only`, or `commit-and-release`
- Retrieve prior local context for planning or research:
  - `node .agents/skills/kamiflow-core/scripts/plan-history.mjs --project . --query "<text>"`
  - returns bounded matches from `.local/project.md`, the active plan, and the latest archived PASS plans
- For opted-in root Node/npm repos, prepare version closeout:
  - `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .`

## Local State Ownership

- `AGENTS.md`
  - repo rules, operating behavior, and optional SemVer release policy
- `.local/project.md`
  - human-facing project context and curated durable memory
- `.local/plans/*.md`
  - active task execution state
- `.local/plans/done/*.md`
  - archived PASS plans
- `.agents/skills/kamiflow-core/`
  - installed skill runtime

For non-fast-path work, read `AGENTS.md` first, then `.local/project.md`, then the active plan. In client repos, the client brief is the default context; in the source repo, the source-repo brief is the default context.

## Route Inference

- Use `references/route-intent.md` as the routing authority.
- Keep `start` as the canonical route token even when the user says `brainstorm` or `idea`.
- Read `.local/project.md` before non-fast-path route work.
- Treat active-plan `next_command` and `lifecycle_phase` as hints, not hard steering.
- If the request is a narrow operational ask like status, diff, summary, commit, release, or finish, let that explicit ask stay on the fast path instead of forcing stale plan-heavy routing.
- For `start`, `plan`, or `research`, use `plan-history.mjs` only when prior similar slices would materially improve the answer; keep it advisory, not mandatory.

## Route Selection

- `start`: request is broad, ambiguous, or asking for brainstorm or idea exploration.
- `plan`: request is concrete enough to specify implementation details and acceptance criteria.
- `build`: an approved plan exists and one implementation slice should be executed now.
- `check`: validate the changed behavior and decide `PASS` or `BLOCK`.
- `research`: gather facts, compare options, or de-risk uncertain work.
- `fix`: repair a concrete issue and then validate it.

## Recovery Shortcuts

- Skill missing from the project:
  - `npx --package @kamishino/kamiflow-core kamiflow-core install --project .`
- Repo contract or project brief is missing:
  - `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`
- No active plan exists:
  - `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`
- Plan is not build-ready:
  - make zero implementation edits, update the plan markdown directly, and end the current response as `plan`
  - rerun `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .` only on the next build or fix attempt
- Archive gate fails:
  - finish the unchecked Implementation Tasks, Acceptance Criteria, and Go/No-Go items, then rerun `archive-plan.mjs`
- User asks `commit please`, `release please`, or `finish please` in a SemVer-enabled repo:
  - first inspect `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .`
  - follow its `recommended_action` instead of guessing from the wording alone
  - keep the request operational; do not reroute into plan/build/check unless the user is actually asking for implementation or closeout evidence
- SemVer closeout is enabled and release impact is patch, minor, or major:
  - first commit the functional changes with a normal repo-owned subject
  - run `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .`
  - use the printed release-only commit command and tag command after the functional commit

## Response Contract

Keep non-fast-path route responses compact:

- `State`
- `Doing`
- `Next`

Add a literal `Check: PASS` or `Check: BLOCK` line whenever work was implemented or validated. Do not wrap `PASS` or `BLOCK` in backticks or other formatting.
