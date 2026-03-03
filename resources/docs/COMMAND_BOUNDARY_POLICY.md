# Command Boundary Policy

## Purpose

Prevent command confusion between maintainers of this repository and client-project users of `kfc`.
For client onboarding, use `resources/docs/CLIENT_KICKOFF_PROMPT.md` as the standard first Codex prompt.

## Rule

1. Run in KFC repo (dogfooding/maintainer context): use `npm run ...`.
2. Run in client project context: use `kfc ...` or `npx --no-install kfc ...`.
3. Do not require `npm run ...` in client-project instructions.

## Examples

Run in KFC Repo:

```bash
npm run dogfood:link
npm run codex:sync -- --scope repo --force
npm run release:plan
```

Run in Client Project:

```bash
npx --no-install kfc client bootstrap --project . --profile client
kfc flow ensure-plan --project .
kfc flow ready --project .
kfc plan validate --project .
```

## Enforcement

- Verify docs with:

```bash
npm run docs:verify-command-boundary
```

- This check fails when `npm run` appears under a `Run in Client Project` section.
