# 0047. The Progress tab: weight, eating and training over a range, then records and the streak

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

The Progress tab shows only a card to log today's weight. How the weight, the eating and the
training went over weeks and months is nowhere to be seen (#269, #270, #271), nor are the
personal records or the streak beyond this week (#275).

## Decision

- **Cards from the top:**
  - **Weight:** the latest weight with joined − and + buttons to log today's, how much it changed
    in the range, and a chart of it over 1, 3 or 6 months or a year, placed by date, with the
    target weight as a dashed line and the day it is reached at the chosen pace.
  - **Calories and macros:** the macros as bars, as a past week shows them (ADR 0046): a bar a
    day over a month, a week over 3 or 6 months and a month over a year, each an average day of
    its days logged, against the average target as a dashed line. Then the range summed up
    against the targets of the days logged, with each macro's average a day. The database gives
    each day, at most a year of them, and whether it kept its target as the streak counts it; the
    app groups the days into weeks and months.
  - **Training:** a heat map of the days, darker the longer the workouts were, with missed
    planned workouts marked, over the same ranges, then how much of the plan was done, the time
    trained and the weight lifted.
  - **Personal records** and the **streak calendar:** each a button that opens its own screen,
    the records as a list of the latest per exercise, the streak month by month with the marks of
    the week card (ADR 0042).
- **Each card is its own pull request**, the weight card first.

## Alternatives considered

- **Lifted weight as the heat map's shade:** it says nothing for cardio and bodyweight workouts;
  their length does.
- **The streak calendar as a card on the tab:** a month of days is tall, and the week card shows
  the streak already; a button keeps the tab short.
- **The weight's change over a fixed 30 days:** the chart's range says more, as the line shows
  the same span.

## Consequences

- The progress chart of an exercise's history draws the weight too: it places points by date, can
  draw a target and leave out the last value's label and the dots of a long line.
- The design is approved as an Artifact before each card is built.
