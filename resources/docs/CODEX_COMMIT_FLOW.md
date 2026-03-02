# Codex Commit Flow

## Purpose

Keep commit handling simple for Codex while preserving deterministic commit-message validation.

## Convention

- Format: `type(scope): summary`
- Allowed `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`
- Optional breaking marker: `type(scope)!: summary`

## Command

```bash
git add <files>
npm run commit:codex -- --message "type(scope): summary"
```

## Wrapper Behavior

1. Run `scripts/git-hooks/commit-msg.mjs` with `--message`.
2. If validation passes, run `git commit -m "<message>"`.
3. If commit fails with known Git hook runtime errors in some Windows sandboxed environments:
   - `couldn't create signal pipe, Win32 error 5`
   - `CreateFileMapping ... Win32 error 5`
   retry once with `git commit --no-verify -m "<message>"`.
4. Print explicit warning when fallback is used.

## Notes

- Wrapper entrypoint: `scripts/git-hooks/commit-with-validation.ps1`.
- Fallback only applies after successful message validation.
- Local hooks remain enabled for normal developer commits outside restricted sandbox environments.
