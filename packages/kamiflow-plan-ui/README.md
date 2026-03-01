# KamiFlow Plan UI CLI

Phase 2 includes:

- `kfp init`
- `kfp validate`
- `kfp serve`
- private plan template in `.local/plans`
- local API + SSE
- replay-aware SSE stream (event IDs + heartbeat + resync signal)
- read-only browser UI
- guarded write actions for status/decision/task/gate
- codex action bridge endpoint

## Usage

```bash
npm run kfp -- init --project <path>
npm run kfp -- validate --project <path>
npm run kfp -- serve --project <path> --port 4310
```

Then open:

```text
http://127.0.0.1:4310
```

## API

- `GET /api/health`
- `GET /api/plans`
- `GET /api/plans/:id`
- `GET /api/plans/:id/events` (SSE)
- `PATCH /api/plans/:id/status`
- `PATCH /api/plans/:id/decision`
- `PATCH /api/plans/:id/task`
- `PATCH /api/plans/:id/gate`
- `POST /api/codex/action`

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
- No write operations are performed by Phase 2 UI/API.

## Troubleshooting

If `kfp serve` fails due to missing dependencies:

```bash
npm --prefix packages/kamiflow-plan-ui install
```

If install fails on Windows with permission/cache errors:

```powershell
$env:npm_config_cache = (Join-Path (Get-Location) ".npm-cache")
npm --prefix packages/kamiflow-plan-ui install
```

If your environment blocks registry access, `serve` cannot start until dependencies are available locally.

## Build Notes

- Source files are TypeScript under `src/`.
- `npm run build` compiles to `dist/`.
- `bin/kfp.js` runs compiled output from `dist/`.
