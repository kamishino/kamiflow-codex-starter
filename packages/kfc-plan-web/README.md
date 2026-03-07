# KFC Plan Web CLI

For normal project workflows, prefer `kfc plan ...` from `@kamishino/kamiflow-codex`.
This package README documents direct `kfc-plan` usage for package-level development and debugging.

Phase 2 includes:

- `kfc-plan init`
- `kfc-plan validate`
- `kfc-plan serve`
- private plan template in `.local/plans`
- local API + SSE
- replay-aware SSE stream (event IDs + heartbeat + resync signal)
- observer-first browser UI (read-only by default)
- guarded write actions for status/decision/task/gate
- codex action bridge endpoint
- completed plan archive flow (`.local/plans/done`)
- optional Playwright browser smoke lane for hydrated KFC Plan UI verification

## Usage

```bash
npm run kfc-plan -- init --project <path>
npm run kfc-plan -- init --project <path> --new
npm run kfc-plan -- validate --project <path>
npm run kfc-plan -- serve --project <path> --port 4310
npm run kfc-plan -- serve --project <path> --mode observer --port 4310
npm run kfc-plan -- serve --project <path> --mode operator --port 4310
npm run kfc-plan -- workspace list
npm run kfc-plan -- workspace add <name> [--project <path>]
npm run kfc-plan -- serve --workspace <name> --port 4310
```

`init --new` always creates a unique file using `YYYY-MM-DD-00x-<route>-<topic-slug>.md` (defaults to `...-plan.md` when no topic is provided).

Then open:

```text
http://127.0.0.1:4310
```

## API

- `GET /api/health`
- `GET /api/projects`
- `GET /api/projects/:project_id/plans`
- `GET /api/projects/:project_id/plans/:id`
- `GET /api/projects/:project_id/plans/:id/events` (SSE)
- `PATCH /api/projects/:project_id/plans/:id/status|decision|task|gate`
- `POST /api/projects/:project_id/plans/:id/progress`
- `POST /api/projects/:project_id/plans/:id/complete`
- `POST /api/projects/:project_id/plans/:id/automation/apply`
- `POST /api/projects/:project_id/codex/action`
- `GET /api/plans`
- `GET /api/plans/:id`
- `GET /api/plans/:id/events` (SSE)
- `PATCH /api/plans/:id/status`
- `PATCH /api/plans/:id/decision`
- `PATCH /api/plans/:id/task`
- `PATCH /api/plans/:id/gate`
- `POST /api/plans/:id/progress`
- `POST /api/plans/:id/complete`
- `POST /api/plans/:id/automation/apply`
- `POST /api/codex/action`

Observer safety mode:

- Default `serve` mode is `observer`.
- In `observer`, all mutation/execute endpoints return `403` with `error_code: READ_ONLY_MODE`.
- Use `--mode operator` only when intentionally enabling write/execute APIs.

Example `GET /api/plans`:

```json
{
  "plans": [
    {
      "plan_id": "PLAN-2026-03-01-001",
      "title": "New Plan",
      "status": "draft",
      "decision": "NO_GO",
      "selected_mode": "Plan",
      "next_mode": "Plan",
      "next_command": "plan",
      "updated_at": "2026-03-01",
      "file_path": "C:\\\\repo\\\\.local\\\\plans\\\\PLAN-2026-03-01-001.md",
      "is_valid": true,
      "error_count": 0,
      "duplicate_plan_id": false
    }
  ]
}
```

Example `GET /api/plans/:id` 404:

```json
{
  "error": "Plan not found",
  "error_code": "PLAN_NOT_FOUND",
  "plan_id": "DOES_NOT_EXIST"
}
```

## Privacy Defaults

- Server binds to `127.0.0.1` only.
- Plans are read from `.local/plans`.
- Completed plans can be archived into `.local/plans/done`.

## Troubleshooting

If `kfc-plan serve` fails due to missing dependencies:

```bash
npm install
```

Run this from repository root so npm installs all workspace dependencies.

If install fails on Windows with permission/cache errors:

```powershell
$env:npm_config_cache = (Join-Path (Get-Location) ".npm-cache")
npm install
```

If your environment blocks registry access, `serve` cannot start until dependencies are available locally.

If global home path is restricted, set `KAMIFLOW_HOME` to override workspace config root.

If you want the browser smoke lane:

```bash
npm run test:browser:install
npm run test:browser
```

Use the Playwright lane for browser-facing KFC Plan changes such as layout, theme, plan picker, or interaction behavior. It is intentionally not part of the default package `test` script.

`workspace add` auto-detects project root when `--project` is omitted:
1. nearest Git root
2. nearest `package.json` root
3. current directory

## Build Notes

- Server source is TypeScript under `src/` and compiles with `tsc`.
- Browser UI source is componentized under `src/client/` (`Preact` + `@preact/signals`).
- UI primitives are under `src/client/ui/` (Shadcn-style card/badge/alert patterns for Preact).
- `npm run build` compiles server code and bundles client UI to `dist/`.
- `bin/kfc-plan.js` runs compiled output from `dist/`.
- UI shell template is Eta under `src/server/views` and is copied to `dist/server/views`.
- Browser bundle output is `dist/server/public/app.js` (built by `scripts/build-client.mjs`).
- Stylesheet source remains `src/server/public/styles.css` and is copied to `dist/server/public/styles.css`.

## UI Command Center

The browser UI provides:

- phase timeline (`Start -> Plan -> Build -> Check -> Done`)
- implementation plan status snapshot with Tasks and Acceptance Criteria checklists
- activity journal with severity tags (`info|ok|warn|error`) and filter (`all|plan|codex|system`)
- actionable empty states (no project / no plan / missing selection)
- responsive tablet mode: at `<=1366px`, layout becomes `Sidebar + Main`, and Activity moves below main content

Typography:

- body/headings: `Work Sans`
- `pre`/`code`: `JetBrains Mono`
- compact scale: `12 / 14 / 16 / 20 / 24`

Design system guardrails:

- dual color tokens with sRGB fallback + OKLCH harmonies (`@supports (color: oklch(...))`)
- 4px layout spacing rhythm for margin/padding/gap/position offsets
- semantic color usage for surface/text/state tokens across KFC Plan components
- accessibility verification gates:
  - `npm run docs:verify:kfc-plan-contrast` (WCAG 2.1 ratio + APCA-oriented thresholds)
  - `npm run docs:verify:kfc-plan-spacing-grid` (4px grid policy)
  - `npm run docs:verify:kfc-plan-design-system` (combined)

Browser verification lane:

- `npm run test:browser` builds KFC Plan and runs Playwright smoke coverage in Chromium
- current smoke coverage verifies:
  - empty state rendering
  - selected plan hydration
  - plan picker switching
  - theme switching
  - compact/expanded phase timeline behavior
- failure artifacts are kept in `test-results/`
