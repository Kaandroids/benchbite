# 0103. Keep the day's steps

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Apple Health and Health Connect count the steps the phone and a watch take. Benchbite reads the stores already (ADR 0097) and shows the day's steps on Today, steps over a range on Progress, and lets Bite take them into account (#469). Bite runs in an Edge Function and Progress shows up to a year, so the steps have to be on the server, not only read from the phone when a screen opens.

## Decision

- **One total a day:** `step_days` keeps the user's steps of each day, as the store counted them. The store already merges the phone's and a watch's counts, so no source is kept.
- **Written only by `import_steps(days, today)`:** it keeps the days of the last year it is given, takes a day's new total when the store counted it again (today grows while the user walks) and returns how many days changed. Users read their own rows; no one writes them directly.
- **What the app reads:** the last year the first time, then the last 30 days each time it comes to the front, as for weight (ADR 0101). Health Connect gives only the 30 days before the permission was granted unless the app asks for the history permission, which it does not.
- **Steps do not change the calorie targets.** The targets already include the activity level chosen in the onboarding; adding the day's steps on top would count the same walking twice. Suggesting a new activity level from the steps can come later.

## Alternatives considered

- **Reading the store each time a screen opens:** Bite could not see the steps, and a year on Progress would read the store each time.
- **Adding the steps' calories to the day's target, as some apps offer:** counts walking twice with the activity level, and makes the target move during the day.
- **Keeping every sample with its source:** far more rows for a number shown per day.

## Consequences

- Today, Progress and Bite read the same totals.
- Android users see at most the 30 days before they connected; iPhone users the whole last year.
- The privacy policy (#44) and Google Play's Health declaration name steps among the data read.
