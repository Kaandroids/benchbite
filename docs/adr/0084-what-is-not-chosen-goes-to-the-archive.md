# 0084. What is not chosen goes to the archive

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

After the one choice of what stays (ADR 0083), the workouts not chosen waited for premium among the
active ones, locked in the list, so that "Active · 4" counted one that could not be started. A free
user can only look at the archive (ADR 0082), which is all they can do with these too.

## Decision

- **`choose_what_stays()` archives the active workouts not chosen.** On a plan without the archive
  they wait there, as all that is in it does, so they can be seen and deleted.
- **With premium they stay in the archive,** no longer waiting, and the user brings back the ones
  they want. They do not return to the week by themselves.
- Users who had already chosen have what waits among their active workouts archived too.
- Until the choice is made, the workouts above the limit wait among the active ones as before, and
  the Workouts tab asks for the choice whenever it opens.

## Alternatives considered

- **Locked in the list, in a section of their own:** nothing moves, and premium returns them to the
  week by themselves, but the list keeps workouts a free user cannot use.
- **Shown in the archive while still active:** premium would return them by themselves, but the
  archive would hold two kinds of workout, for a difference only premium users would notice.

## Consequences

- After the choice the list holds only workouts that can be started, and the count is right.
- A user back on premium has to bring workouts back from the archive by hand, days included.
- Workouts brought back count again, so the next end of premium can open a new choice.
- This amends ADR 0083, in which what was not chosen waited among the active workouts.
