# Project Brief

## Product Summary
- Product: an offline-first notes app for solo use on laptop and phone
- Primary user: one person capturing and organizing notes quickly
- Core outcome: reliable note capture and sync without cloud-account complexity

## Current Priorities
- Ship cross-device sync without accounts
- Keep note editing fast when the network is unavailable
- Make conflict handling understandable before expanding scope

## Architecture Guardrails
- Keep SQLite as the single local source of truth
- Do not add auth or user accounts in this phase
- Prefer small background sync steps over a new backend platform

## Open Questions
- What conflict strategy is clear enough for solo use?
- Should sync be manual-first or background-first?

## Recent Decisions
- Local-first behavior is more important than collaboration features
- Account-free sync is in scope before any team workflow
