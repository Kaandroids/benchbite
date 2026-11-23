# 0165. Show a workout's muscles on the whole figure

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

ADR 0162 put a map of the trained muscles in place of the exercise pictures. For the small tiles
of lists it chose the part of the body where an exercise's first muscle is, and turned down the
whole figure: at 40 to 64 points the trained muscle is only a few points wide.

Workouts are listed too, on the Today tab and the Workouts tab, and every row had the same
dumbbell icon (#304). A workout trains several parts of the body, often on both sides: a full body
workout trains the thighs from the front and the glutes and hamstrings from the back.

## Decision

- **A workout's muscles are joined from its exercises:** those any of them trains first in the
  brand colour, those that only help in the paler one. A past workout uses the exercises it had
  when it started.
- **Its small tile shows the whole figure, from the front and the back side by side,** at 44 to 64
  points, on Today's cards and on each workout's card. A workout without exercises keeps the
  dumbbell.
- **Its screen shows both figures large,** with the muscles in words below them: what it trains
  mainly and what it also works. The subtitle no longer repeats them.
- **An exercise keeps its zoomed zone,** as ADR 0162 decided: it trains one part of the body.

## Alternatives considered

- **The zone of the first muscle, as for exercises:** a full body workout would show its thighs
  alone, and its back would go unseen.
- **One side, the one with most muscles:** larger, but hides the other side's muscles; shown in
  the mock-up and not chosen.
- **The workout's type as an icon (push, pull, legs):** says less than the muscles, and nothing for
  a workout the user built.

## Consequences

- Rows of workouts tell apart at a glance, and a week shows what it trained.
- At these sizes a muscle is a few points wide: the tile tells which parts of the body work, the
  workout's screen tells which muscles.
