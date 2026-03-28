# Command Map

Use this map to execute the inferred route and the right recovery command.

Client repos are the default target. Treat the kamiflow-core source repo as the source-repo exception, and keep the source-only forward-test bundle and maintainer checks there.

## Core Daily Use

- Install or refresh the skill in a client repo:
  - `npx --package @kamishino/kamiflow-core kamiflow-core install --project .`
  - use this for first install, reinstall, or repair after the skill runtime is missing
- Recover one active plan or the runtime project brief:
  - `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`
  - use this when `.local/project.md` or the active plan is missing
- Check build readiness:
  - `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .`
  - use this before `build` or `fix` when you need a deterministic GO/BLOCK answer
- Check closeout gates and optionally archive on PASS:
  - `node .agents/skills/kamiflow-core/scripts/check-closeout.mjs --project .`
  - `node .agents/skills/kamiflow-core/scripts/check-closeout.mjs --project . --archive-if-pass`
  - use this for "check this slice" or "check and archive"

## Advanced Recovery

- Archive completed PASS work directly:
  - `node .agents/skills/kamiflow-core/scripts/archive-plan.mjs --project . --plan <path>`
  - use this only after the plan already reached PASS closeout
- Inspect plan hygiene without mutating plan files:
  - `node .agents/skills/kamiflow-core/scripts/cleanup-plans.mjs --project .`
  - use this only when active-plan state feels stale, conflicting, or unclear
- Retrieve prior local context for planning or research:
  - `node .agents/skills/kamiflow-core/scripts/plan-history.mjs --project . --query "<text>"`
  - use this only when prior similar slices would materially improve `start`, `plan`, or `research`
- Inspect the active plan in one compact snapshot:
  - `node .agents/skills/kamiflow-core/scripts/plan-snapshot.mjs --project . --format text|markdown|json`
  - use this for terminal summaries, compact status cards, or machine-readable active-plan reads
- Open the lightweight live plan view:
  - `node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --open`
  - use this only when you explicitly want a live read-only plan screen in the browser
- Stop the lightweight live plan view:
  - `node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --stop`
  - use this when the local plan-view server should be shut down or reset

## Release And Maintainer

- In the kamiflow-core source repo, refresh the repo-local runtime:
  - `npm run skill:sync`
  - use this for repo-local source-repo sync, not for ordinary client repos
- Inspect the correct finish action:
  - `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .`
  - use this before acting on `commit please`, `release please`, or `finish please`
  - expect one of `commit-only`, `release-only`, or `commit-and-release`
- For opted-in root Node/npm repos, prepare version closeout:
  - `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .`
  - use this only after the functional commit is already done and `finish-status.mjs` recommends release work
- In the kamiflow-core source repo, publish the npm package from GitHub Releases:
  - publish the matching GitHub Release for the pushed `vX.Y.Z` tag
  - the source repo workflow `.github/workflows/publish-npm.yml` performs validation and `npm publish`
  - prefer npm Trusted Publishing; keep `NPM_TOKEN` only as the fallback path

## Local State Ownership

- `AGENTS.md`
  - repo rules, operating behavior, and optional SemVer release policy
- `.local/project.md`
  - human-facing project context and curated durable memory
- `.local/plans/*.md`
  - active task execution state
- `.local/plans/done/**/*.md`
  - archived PASS plans, with the newest 20 kept flat in `.local/plans/done/` and older ones rolled into weekly buckets like `2026/W13/`
- `.local/plan-view/runtime.json`
  - ephemeral runtime marker for the optional live plan view
- `.agents/skills/kamiflow-core/`
  - installed skill runtime

For non-fast-path work, read `AGENTS.md` first, then `.local/project.md`, then the active plan. In client repos, the client brief is the default context; in the source repo, the source-repo brief is the default context.

## Route Inference

- Use `references/route-intent.md` as the routing authority.
- Keep the internal lane model clarity-first:
  - fast path for narrow operational asks
  - `start` for persisted plan-lite shaping
  - `plan` for full implementation planning
- Keep `start` as the canonical route token even when the user says `brainstorm` or `idea`.
- Read `.local/project.md` before non-fast-path route work.
- Treat active-plan `next_command` and `lifecycle_phase` as hints, not hard steering.
- If the request is a narrow operational ask like status, diff, summary, commit, release, or finish, let that explicit ask stay on the fast path instead of forcing stale heavier-planning routing.
- If the request is `open plan view`, keep it on the fast path and use `plan-view.mjs` rather than treating it as implementation work.
- Use `plan-history.mjs` only when prior similar slices would materially improve the answer.

## Route Selection

- `start`: request is bounded but unclear and still needs a chosen approach, clearer scope, or success checks before full planning
- `plan`: request is concrete enough to specify implementation details, acceptance criteria, and validation commands
- `build`: an approved plan exists and one implementation slice should be executed now
- `check`: validate the changed behavior and decide `PASS` or `BLOCK`
- `research`: gather facts, compare options, or de-risk uncertain work
- `fix`: repair a concrete issue and then validate it

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
- Plan state feels stale or messy:
  - first inspect `node .agents/skills/kamiflow-core/scripts/cleanup-plans.mjs --project .`
  - treat its output as report-first guidance; do not guess whether older active plans are safe to ignore
- Archive gate fails:
  - finish the unchecked Implementation Tasks, Acceptance Criteria, and Go/No-Go items, then rerun `archive-plan.mjs`
- User asks to check and archive the current slice:
  - first use `node .agents/skills/kamiflow-core/scripts/check-closeout.mjs --project .`
  - if you want explicit archive on PASS, rerun with `--archive-if-pass`
  - keep release separate and use `finish-status.mjs` afterward when the repo is SemVer-enabled
- User asks `commit please`, `release please`, or `finish please` in a SemVer-enabled repo:
  - first inspect `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .`
  - follow its `recommended_action` instead of guessing from the wording alone
  - keep the request operational; do not reroute into plan, build, or check unless the user is actually asking for implementation or closeout evidence
- User asks `open plan view`:
  - first use `node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --open`
  - rely on `plan-snapshot.mjs` as the live view's read model
  - keep the request operational and do not mutate the active plan
- SemVer closeout is enabled and release impact is patch, minor, or major:
  - remember that the effective bump comes from the highest unresolved impact in the release window since the latest `vX.Y.Z` tag
  - first commit the functional changes with a normal repo-owned subject
  - run `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .`
  - use the printed release-only commit command and tag command after the functional commit
  - in the kamiflow-core source repo, push the tag and publish the matching GitHub Release so the npm publish workflow can run

## Response Contract

Keep non-fast-path route responses compact:

- `State`
- `Doing`
- `Next`

Add a literal `Check: PASS` or `Check: BLOCK` line whenever work was implemented or validated. Do not wrap `PASS` or `BLOCK` in backticks or other formatting.
