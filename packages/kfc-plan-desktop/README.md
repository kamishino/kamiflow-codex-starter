# KamiFlow Plan Desktop

Desktop shell for KFC Plan UI using Electron and embedded local server mode.

## Commands

```bash
npm run -w @kamishino/kfc-plan-desktop dev
npm run -w @kamishino/kfc-plan-desktop test
```

## Behavior

- starts embedded KFC Plan server (`observer` mode)
- opens a single BrowserWindow to local KFC Plan URL
- enforces single-instance lock
- restores last hash route and window bounds
- resolves target folder with priority: runtime override -> last used folder -> folder picker
- supports two target modes:
  - project root (must contain `.local/plans`)
  - plans directory (advanced, for external/cross-machine plan storage)
- persists recent locations for quick switching from the desktop menu

## Runtime Overrides

```bash
# project root mode
KFC_PLAN_PROJECT_DIR=/path/to/project npm run -w @kamishino/kfc-plan-desktop dev

# advanced: direct plans directory mode
KFC_PLAN_PLANS_DIR=/path/to/.local/plans npm run -w @kamishino/kfc-plan-desktop dev
```

