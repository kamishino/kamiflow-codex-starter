# Contributor Bootstrap

## Purpose

Provide one explicit setup command for new clones so local Codex and clean-commit enforcement are consistently configured.

## Command

```bash
npm run bootstrap
```

Current bootstrap sequence:

1. `npm run codex:setup`
2. `npm run codex:sync -- --scope repo --force`
3. `npm run hooks:enable`

## Why Explicit (No postinstall/prepare)

- Avoid hidden Git config changes during dependency install.
- Keep repository setup opt-in and visible in terminal logs.
- Make failures actionable and isolated to an explicit step.

## Recovery

If local hook configuration drifts:

```bash
npm run hooks:enable
npm run hooks:check
```

## Post-Merge Automation

After `npm run hooks:enable`, Git `post-merge` runs local automation:

1. Detect changed files from merge range (`ORIG_HEAD..HEAD`, fallback `HEAD@{1}..HEAD`).
2. Run `npm install` only when one of these files changed:
   - `package.json`
   - `package-lock.json`
   - `packages/*/package.json`
3. Run `npm run codex:sync -- --scope repo --force` only when changed files include:
   - `resources/skills/**`
   - `resources/rules/**`

Safety behavior:

- Hook actions are warn-only on failure (merge completion is not blocked).
- Set `KFC_POST_MERGE_SKIP=1` to skip hook actions for one shell/session.
