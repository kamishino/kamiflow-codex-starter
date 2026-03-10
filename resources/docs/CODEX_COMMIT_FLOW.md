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

1. Run `dist/scripts/git-hooks/commit-msg.js` with `--message`.
2. Print semantic version impact for the commit message (`none|patch|minor|major`) plus the suggested next release version.
3. Run `npm run docs:sync` to refresh generated doc mirrors before commit.
4. Run `npm run verify:governance` so docs freshness and governance checks pass before commit.
5. If validation passes, run `git commit -m "<message>"`.
6. If commit fails with known Git hook runtime errors in some Windows sandboxed environments:
   - `couldn't create signal pipe, Win32 error 5`
   - `CreateFileMapping ... Win32 error 5`
   retry once with `git commit --no-verify -m "<message>"`.
7. Print explicit warning when fallback is used.

## Notes

- Wrapper entrypoint: `scripts/git-hooks/commit-with-validation.ps1`.
- The semantic version summary is advisory only; it does not bump workspace versions.
- Fallback only applies after successful message validation plus docs/governance checks.
- Local hooks remain enabled for normal developer commits outside restricted sandbox environments.
