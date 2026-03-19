# Codex Surface Architecture

Internal doctrine for how Kami Flow Core should relate to Codex surfaces.

## Core Doctrine

KFC automates through Codex-CLI, collaborates through Codex App, and governs both through plan state.

This is a hierarchy, not a menu of equivalent surfaces:

- `Codex-CLI` is the canonical execution layer.
- `Codex App` is the human-facing control plane for communication, review, and session continuity.
- KFC owns workflow state, readiness, evidence, and route discipline.

## Platform Support Policy

KFC support tiers are based on execution-contract compatibility, not model branding:

- `Official support`: `Codex-CLI`
- `Official companion support`: Codex App
- `Experimental support`: OpenCode using Codex model
- `Not supported yet`: model-only compatibility claims

### `Official support`: `Codex-CLI`

- Treat `codex exec` and related native CLI behavior as the canonical KFC execution contract.
- Validate automation, bootstrap, portability, plan flow, and recovery here first.
- If a workflow passes only outside Codex CLI, KFC should still treat the contract as incomplete.

### `Official companion support`: Codex App

- Position Codex App as the human-facing place for communication, visibility, planning, review, and session continuity.
- Keep it first-class for user experience without promoting it to canonical execution authority.
- Describe it as the best place to guide and observe work, not the surface that owns execution truth.

### `Experimental support`: OpenCode using Codex model

- Treat OpenCode as a separate compatibility target because the surrounding tool contract is different even when the model family is similar.
- Make no parity promise until KFC adds and validates an explicit adapter lane.
- Frame support as best-effort only, with risk around prompt wrapping, tool semantics, session behavior, and recovery.

### `Not supported yet`: model-only claims

- Do not present "uses the Codex model" as equivalent to "works with KFC."
- Promote platform compatibility only after KFC proves the execution contract, not because the model label matches.

## Surface Map

| Surface | Primary Role | Owns | Must Not Own |
| --- | --- | --- | --- |
| `kfc client` | Bootstrap and handoff | project inspection, managed scaffolding, CLI launch handoff | long-lived interactive control, hidden browser execution |
| `Codex-CLI` | Canonical execution engine | `codex exec` runs, replayable commands, failure/recovery substrate | workflow truth, UI state |
| `Codex App` | Human control plane | brainstorming, review, delegation, session continuity, richer context | canonical execution authority, hidden automation engine |
| `KFC Plan` | Observer-first workflow view | plan truth, readiness, activity evidence, next-step visibility | direct Codex execution ownership |
| `KFC Chat/Session` | Project-bound session bridge | binding, discovery, resume guidance, light session actions | alternate execution protocol, plan truth |

## Design Principles

1. Keep execution CLI-first.
   Every canonical Codex run in KFC should reduce to a deterministic `codex exec` lane that can be replayed, wrapped, and debugged.
2. Keep the App human-first.
   Use Codex App where richer conversation, session continuity, subagents, and "seeing" the work matter more than deterministic subprocess control.
3. Keep plan state authoritative.
   KFC should store workflow truth in plan markdown, readiness gates, and evidence streams rather than in transient UI state.
4. Keep browser and desktop surfaces observer-only by default.
   App-facing surfaces may explain, guide, bind, and resume, but they must not quietly become hidden execution engines.
5. Encode only deterministic boundaries as rules.
   When a boundary can be expressed as a command policy, put it in rules; when it is architectural guidance, keep it explicit in docs and governance review.

## Messaging Hierarchy

- `Codex-CLI` = worker
- `Codex App` = cockpit
- `OpenCode` = separate experimental surface

## Surface Guidance

### `kfc client`

Do:

- inspect the target repo and prepare the KFC contract
- create or refresh the managed handoff files
- launch Codex through the CLI substrate when automation is appropriate

Do not:

- become a second long-lived chat surface
- hide execution authority inside browser-only flows

### `Codex-CLI`

Do:

- remain the canonical worker for automated execution
- preserve replayable command output and failure classification
- provide the substrate that KFC wrappers can validate and recover

Do not:

- absorb workflow truth that belongs in plan state
- pretend to be the user-facing explanation layer

### `Codex App`

Do:

- serve as the friendlier place to communicate, review, brainstorm, and delegate
- help users inspect state, understand blockers, and continue work across sessions

Do not:

- become the source of truth for KFC workflow state
- bypass the CLI substrate by introducing hidden direct execution lanes

### `KFC Plan`

Do:

- stay observer-first
- show plan state, evidence, activity, and next-step guidance
- reflect canonical workflow state from plan files and run logs

Do not:

- act like a competing Codex execution console
- own direct Codex execution behavior

### `KFC Chat/Session`

Do:

- bridge projects to existing Codex sessions
- help users discover, bind, and resume work with minimal friction

Do not:

- replace `Codex-CLI` as the execution substrate
- drift into a parallel workflow-state system

## Governance Implications

- Review workflow-surface changes against this doctrine before adding new UX affordances.
- Prefer docs and governance review for architectural boundaries that are not safely expressible as command rules.
- If a future surface needs launch affordances, keep the execution path explicit and CLI-backed instead of inventing a second execution protocol.
- Promote a platform to `official` only after it passes the same proof lanes KFC uses for Codex-native bootstrap, execution, plan lifecycle, and recovery.
- Use `companion` only for surfaces that are strong for steering and visibility while remaining non-canonical for execution.
- Use `experimental` only when the surface may work in practice but KFC has not yet validated contract-level compatibility.
