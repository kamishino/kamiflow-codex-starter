# KFC Chat

Web-first bound Codex session chat utility.

## Purpose

KFC Chat is separate from the other KFC surfaces.

- `kfc`: Kami Flow workflow and client-project automation
- `kfc-session`: Codex session browsing and transfer utility
- `kfc-chat`: one bound Codex session per project with guarded browser prompting

## Commands

```bash
kfc-chat serve --project .
kfc-chat bind --project . --session-id <session-id>
kfc-chat bind show --project .
kfc-chat unbind --project .
```
