# 0015. Load and cache the user's data with TanStack Query

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Until now, each screen loaded what it needed in an effect of its own, as the plan screen does with
exercise names. The main screens share data: the plan is shown on Today and on the Workout tab, and
a weight logged on Today changes the targets on Today and the chart on Progress. Every screen would
need loading and error states, and every change would have to tell the other screens to load
again.

## Decision

Data from Supabase is loaded through TanStack Query (`@tanstack/react-query`):

- Each kind of data has a hook next to its feature, such as `usePlan()` or `useNutritionTargets()`,
  with a query key naming it. Changes are mutations that invalidate the keys they affect, for
  example logging a weight invalidates the weights and the targets.
- Data counts as fresh for a minute, and is loaded again when the app returns to the foreground.
- Every signed-in user gets a query client of their own, so data of a guest account that was
  replaced never reaches the next user.

The onboarding keeps its own state (ADR 0011): it is a draft on the device, not data from the
server.

## Alternatives considered

- **Effects and state in each screen**: no dependency, but loading, error and refresh logic is
  written again for every screen, and nothing keeps screens that show the same data in step.
- **SWR**: similar, but with less support for mutations and invalidation.
- **Supabase Realtime subscriptions**: keep data live across devices, at the cost of a socket per
  table. A user changes their data on one device at a time, so loading on focus is enough for now.

## Consequences

- Screens get loading, error and refetch states from the same place, and shared data is loaded
  once.
- One more dependency, and a cache whose keys have to be invalidated correctly by every change.
- In tests, a query client that does not retry is created for each render; tests that use the
  app's own client need fake timers, as its cleanup timer keeps Jest running otherwise.
