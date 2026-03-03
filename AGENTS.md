# Agent Instructions

This repository has four active scopes:

1. CLI product development in `src/` and `bin/`.
2. Plan UI product work in `packages/kamiflow-plan-ui/` (Preact + signals + Eta shell, built browser assets in `dist/server/public`).
3. Dogfooding in `dogfood/` using linked or packed installs.
4. In-repo Codex skill/rules dogfooding from SSOT.

`resources/` is the SSOT area.

## Boundaries

- Keep canonical docs/skills/rules content in `resources/`.
- Keep canonical skill content in `resources/skills`.
- Treat `.agents/skills` as generated runtime output, not manual-edit files.
- Keep rules SSOT in `resources/rules/base.rules` and `resources/rules/profiles/*.rules`.
- Treat `.codex/rules/kamiflow.rules` as generated runtime output, not manual-edit files.
- Keep `.codex/rules/default.rules` for Codex-managed approvals; do not overwrite it from SSOT.
- Never commit private/secrets-bearing `.codex` runtime config.
- Do not import `src/*` directly from dogfood fixtures.
- Dogfood fixtures must consume the CLI as users do (`npm link` or tarball install).

## Command Boundary

- In KFC repo (`kamiflow-codex-starter`), use `npm run ...` maintainer scripts.
- In client projects, use `kfc ...` (or `npx --no-install kfc ...`), not this repo's `npm run ...`.
- Client bootstrap flow is `kfc client` -> Codex reads `.kfc/CODEX_READY.md` -> `kfc client done` for cleanup.

## KFP UI Rules

- Keep KFP observer-first by default; do not reintroduce unsafe mutation/execute controls in observer mode.
- Preserve current KFP architecture in `packages/kamiflow-plan-ui` (Preact components + signal-driven UI state + Eta shell).
- Keep semantic, tokenized styles in `packages/kamiflow-plan-ui/src/server/public/styles.css`.
- Avoid adding ad-hoc raw colors/spacing when semantic tokens already exist.

## Design-System Gates

- KFP UI changes must pass:
- `npm run docs:verify:kfp-contrast`
- `npm run docs:verify:kfp-spacing-grid`
- `npm run docs:verify:kfp-design-system`
- `node packages/kamiflow-plan-ui/test/run.mjs` (or `npm --prefix packages/kamiflow-plan-ui test`)
- Color system policy is dual strategy: sRGB fallback + OKLCH harmonies.
- Layout spacing policy is 4px rhythm for layout spacing properties.
- Accessibility policy is WCAG 2.1 AA ratio + APCA-oriented thresholds via policy scripts.

## Commit Workflow

- Preferred commit path: `npm run commit:codex -- --message "type(scope): summary"`.
- If local Git hooks fail with `env.exe` signal-pipe Win32 error 5, fallback to `git commit --no-verify`.
- When fallback is used, record the reason in your task note/summary.

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
- Do not manually edit generated runtime outputs unless the task explicitly targets generated output behavior.
