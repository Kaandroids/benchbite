# 0002. Keep a single Expo project at the repository root

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

The repository contains one mobile app and its Supabase backend (migrations and Edge Functions).
The app code needs a home, and the layout decides how tooling such as pnpm, Metro and the
Supabase CLI find their files.

## Decision

The Expo project lives at the repository root, with app code under `src/` and Expo Router
screens under `src/app/`. The Supabase project will live in `supabase/` at the root, which is
where the Supabase CLI expects it.

## Alternatives considered

- **A pnpm workspace monorepo** (`apps/mobile`, `packages/*`): useful when several apps share
  code, but there is only one app. It would add workspace configuration and the extra Metro
  setup needed to resolve symlinked packages, without any code to share yet.

## Consequences

- Tooling works with default settings: no workspace configuration and no Metro customisation.
- Commands run from the root, which keeps the README and CI simple.
- If a second app or a shared package appears, moving to a workspace means relocating the app
  into a subfolder. That migration would be recorded in a new ADR.
