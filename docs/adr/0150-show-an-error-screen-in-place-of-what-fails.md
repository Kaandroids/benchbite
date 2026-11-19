# 0150. Show an error screen in place of what fails

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

An error while a screen renders unmounts everything React drew, which in a release build leaves a
blank screen and no way on but closing the app (#550). Errors are now reported to Sentry
(ADR 0149), but the person still sees nothing.

## Decision

- **Expo Router's error boundaries show `ErrorScreen`** (`src/components/error-screen.tsx`) in
  place of what failed: Bite looking sorry, what happened in plain words, and Try again, which
  draws that part anew.
- **As close to the failure as the tabs allow:**
  - Workout, Nutrition and Progress's layouts, and Today, so that the tab bar stays and the other
    tabs keep working. Their screen keeps its buttons above the floating tab bar, and offers Today,
    but on Today itself.
  - Every screen that opens over the tabs, with the way to Today: Bite's, the workout in progress,
    Settings, Premium, the AI consent and the account's screens. A new screen over the tabs exports
    `SectionErrorBoundary` too.
  - The onboarding and the root layout, for the whole app, with Try again only.
- **What a boundary catches is reported:** React hands it to the boundary, not to the global
  handler, so each boundary is wrapped with Sentry's `wrapExpoRouterErrorBoundary`, through
  `reportingErrorBoundary()` in `src/lib/reporting.ts`.
- **Failing again within 30 seconds of Try again says so,** asking to close and open the app, and
  that we were told, only when reporting is on.
- **The text says what was logged is safe,** which holds: what is logged is saved on the server as
  it is, and a workout in progress on the phone too.

## Alternatives considered

- **One boundary at the root:** simpler, but every failure would take the tab bar with it.
- **A boundary on every screen in the tabs:** each route would need its own export, for the same
  screen as its tab's layout gives. Screens over the tabs have no such layout, so each exports its
  own.
- **React's own error boundary component around the providers:** Expo Router already has one per
  route, with a retry that redraws the route.

## Consequences

- An error in an event handler or a failed request does not reach a boundary; those keep their own
  messages, and the ones that matter are reported separately (#550).
- In development, React Native's red box shows first, with the screen behind it; a release build
  shows the screen alone, as tried on the simulator.
