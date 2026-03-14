# dogfood

## Purpose

In-repo integration and dogfooding fixtures used to validate the CLI as a real consumer.

## Conventions

- Fixtures should install/use the CLI the same way external users do.
- Avoid importing `src/*` directly from fixtures.
- Prefer reusable fixture workflows over bespoke, one-off scripts.
