# Codex Anti-Patterns (SSOT)

Use this catalog to convert repeated mistakes into deterministic guardrails.

| ID | Scope | Bad Pattern | Detection Signal | Corrective Command | Rule Target | Skill Target |
| --- | --- | --- | --- | --- | --- | --- |
| AP-001 | client | Run repo-only `npm run ...` commands in client project | command boundary violation, wrong-context scripts (`dogfood:*`, `codex:sync*`, release scripts) | `kfc client` (or `kfc client bootstrap --project . --profile client`) | `resources/rules/profiles/client.rules` | `resources/skills/kamiflow-core/SKILL.md` |
| AP-002 | client | Use direct `kfp` guidance for client-facing workflows | docs or output suggests `kfp` where `kfc` is required | `kfc client` then continue with `kfc flow ...` commands | `resources/rules/profiles/client.rules` | `resources/skills/kamiflow-core/SKILL.md` |
| AP-003 | runtime | Manually edit generated runtime files (`.agents/skills`, `.codex/rules/kamiflow.rules`) | manual edits in generated paths, drift from SSOT | `npm run codex:sync -- --scope repo --force` (repo) or `kfc client --force` (client) | `resources/rules/base.rules` | `resources/skills/kamiflow-core/SKILL.md` |
| AP-004 | runtime | Incorrect Codex CLI invocation/quoting (`spawn ENOENT`, `unexpected argument`) | `spawn codex ENOENT`, `unexpected argument ...` | Use validated wrapper command path and quoted prompt via KFC flow automation (for manual fallback: `codex exec \"<prompt>\"`) | `resources/rules/base.rules` | `resources/skills/kamiflow-core/SKILL.md` |
| AP-005 | git | Commit blocked by hook crash (`env.exe` Win32 error 5) | `couldn't create signal pipe, Win32 error 5` | `git commit --no-verify -m \"<message>\"` then record fallback reason in task summary | `resources/rules/base.rules` | `resources/skills/kamiflow-core/SKILL.md` |
| AP-006 | plan | Plan bootstrap command fails and flow stalls | `kfc plan init ... --new` failure, no active plan file | `kfc flow ensure-plan --project .` (fallback: `kfc plan init --project . --new`) | `resources/rules/base.rules` | `resources/skills/kamiflow-core/references/plan.md` |
| AP-007 | build | Implementation starts without a resolved plan file | `build`/`fix` route runs without concrete `.local/plans/*.md` target | `kfc flow ensure-plan --project .` then continue only after plan resolution succeeds | `scripts/policy/verify-kamiflow-skill-contract.mjs` | `resources/skills/kamiflow-core/references/build.md`, `resources/skills/kamiflow-core/references/fix.md` |
