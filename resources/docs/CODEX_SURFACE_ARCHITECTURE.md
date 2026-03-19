# Codex Surface Architecture

Internal doctrine for how Kami Flow Core should relate to Codex surfaces.

## Core Doctrine

KFC automates through Codex-CLI, collaborates through Codex App, and governs both through plan state.

This is a hierarchy, not a menu of equivalent surfaces:

- `Codex-CLI` is the canonical execution layer.
- `Codex App` is the human-facing control plane for communication, review, and session continuity.
- KFC owns workflow state, readiness, evidence, and route discipline.

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
