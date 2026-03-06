# KamiFlow Plan Desktop

Desktop shell for KFP UI using Electron and embedded local server mode.

## Commands

```bash
npm run -w @kamishino/kamiflow-plan-desktop dev
npm run -w @kamishino/kamiflow-plan-desktop test
```

## Behavior

- starts embedded KFP server (`observer` mode)
- opens a single BrowserWindow to local KFP URL
- enforces single-instance lock
- restores last hash route and window bounds
