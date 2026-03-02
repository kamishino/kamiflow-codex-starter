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
