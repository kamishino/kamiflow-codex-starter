# Plan Spec

Use `AGENTS.md` for repo rules and `.local/project.md` for product memory. This file defines the full-plan contract for a build-ready implementation slice plus a short `Project Fit` tie-back. `ready-check.mjs` blocks placeholder `Goal`, `Project Fit`, `Implementation Tasks`, `Acceptance Criteria`, and `Validation Commands` content.

`start` may persist lightweight shaping in the same plan file before promotion. During `start`, only `Start Summary`, `Goal`, `Scope (In/Out)`, `Constraints`, `Project Fit`, `Open Decisions`, `Handoff`, and `WIP Log` need substantive content, and the handoff must remain `next_command: plan` / `next_mode: Plan`. Promotion into the full-plan contract happens in `plan` before any `build` or `fix` work.

## Start Summary
- Required: yes|no
- Reason:
- Selected Idea:
- Alternatives Considered:
- Pre-mortem Risk:
- Handoff Confidence:

## Goal
- Outcome:
- Out of scope:

## Scope (In/Out)
- In:
- Out:

## Constraints
- Technical:
- Risk:

## Project Fit
- Relevant priority:
- Relevant guardrail:

## Assumptions
- [ ] 

## Open Decisions
- [ ] 
- Remaining Count:

## Implementation Tasks
- [ ] 

## Acceptance Criteria
- [ ] 
- [ ] 

## Validation Commands
- `runnable-command`

## Release Impact
- Impact: none|patch|minor|major
- Reason:
- Include this section only when the repo enables the SemVer workflow.

## Risks & Rollback
- Risk:
- Mitigation:
- Rollback:

## Go/No-Go Checklist
- [ ] Goal is explicit
- [ ] Scope in/out is explicit
- [ ] No unresolved high-impact decisions
- [ ] Tasks and validation commands are implementation-ready

## Handoff
- Next command: build
- Next mode: Build

## WIP Log
- timestamp - Status:
- timestamp - Blockers:
- timestamp - Next step:
