# Versioning Runbook

## Goal

Support semantic versioning without npm publish:

- stable release versions (`x.y.z`) via explicit release cut
- commit-trace artifacts (`x.y.z-dev.<shortsha>`) for internal distribution

## Commit Convention to Bump Mapping

- `BREAKING CHANGE` or `type(scope)!:` => `major`
- `feat(...)` => `minor`
- all other commits (`fix`, `docs`, `chore`, etc.) => `patch`

`release:plan` and `version:next` suggest the bump, but final release bump is chosen manually.

## Commands

Compute next version suggestion:

```bash
npm run version:next
```

Show release planning summary:

```bash
npm run release:plan
```

Cut release commit + tag (shared workspace version):

```bash
npm run release:cut -- --bump major
npm run release:cut -- --bump minor
npm run release:cut -- --bump patch
```

Create commit-trace pack artifact:

```bash
npm run pack:commit
```

## Release Cut Behavior

`release:cut` does:

1. bump version in root `package.json` and `packages/kamiflow-plan-ui/package.json`
2. commit with `chore(release): vX.Y.Z` (via `commit:codex`)
3. create annotated tag `vX.Y.Z`
4. print push instructions

It does not publish to npm.

## Artifact Naming

`pack:commit` outputs:

- `<normalized-package-name>-<current-version>-dev.<shortsha>.tgz`

Example:

- `kamishino-kamiflow-codex-0.2.0-dev.5fd2efd.tgz`

## Notes

- No per-commit `package.json` version churn.
- Workspace packages share one release version (`@kamishino/kamiflow-codex` and `@kamishino/kamiflow-plan-ui`).
- In restricted/sandboxed shells that block child-process spawn, run release commands in a normal local terminal.
