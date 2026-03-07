# KFC Remote Runbook

Use this runbook when you want a mobile-friendly remote surface for the workstation that is running KFC/Codex.

## Scope

Phase 1 is intentionally narrow:

- mobile web app, not native iOS/Android
- Tailscale or another private network layer outside KFC
- authenticated viewing of session state and transcript
- serialized prompt submission through the workstation

Phase 1 does **not** provide:

- public internet exposure
- raw shell control from mobile
- direct KFC Plan mutation controls
- a true multi-client shared Codex thread API

The workstation remains the canonical execution controller. The mobile view is a mirrored session with a guarded prompt queue.

## Start The Server

From the project root:

```bash
kfc remote serve --project . --host 127.0.0.1 --port 4320
```

KFC prints:

- remote URL
- access token

If you want the server in the background:

```bash
kfc remote serve --project . --host 127.0.0.1 --port 4320 --detach
```

Stop the detached server:

```bash
kfc remote stop --project .
```

## Token Management

Generate or rotate a token:

```bash
kfc remote token gen --project . --overwrite
```

Show the current token:

```bash
kfc remote token show --project .
```

Revoke the token:

```bash
kfc remote token revoke --project .
```

## Session Requirement

Remote prompting requires a bound client session at:

```text
.kfc/session.json
```

If the file is missing, the remote UI can still load, but prompt submission is blocked until the project is bootstrapped again.

Recommended bootstrap:

```bash
kfc client --force --no-launch-codex
```

## Network Model

KFC does not expose itself publicly by default. The recommended phase-1 model is:

1. Run the remote server on the workstation.
2. Reach the workstation over Tailscale.
3. Use the printed token in the mobile web UI.

Keep the server on a private network surface. Treat the token as a local secret.

## Private State

The remote feature stores private state in gitignored paths:

- `.kfc/remote-auth.json`
- `.kfc/remote-session.json`
- `.local/remote/transcript.jsonl`

Codex can read these files locally, but they should not be committed.

## Safety Limits

- only one prompt executes at a time
- additional prompts are queued
- KFC remains the guardrail layer over Codex execution
- mobile cannot issue raw shell commands or bypass Kami Flow

## Troubleshooting

- `REMOTE_AUTH_REQUIRED`: verify the access token
- `REMOTE_SESSION_NOT_BOUND`: regenerate `.kfc/session.json` via `kfc client --force --no-launch-codex`
- no transcript updates: verify the workstation can still run Codex locally
- mobile cannot connect: verify the port/host and Tailscale reachability

