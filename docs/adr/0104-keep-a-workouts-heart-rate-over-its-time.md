# 0104. Keep a workout's heart rate over its time

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

A logged workout keeps its average and highest heart rate and its active calories (ADR 0098), which say how hard it was overall. A chart of the heart rate over its time shows how hard each set was and how far the heart rate came down while resting (#480). The samples could be read from the phone's health store whenever the screen opens, or kept with the log. Some watch apps write a heart rate but no calories; the log then shows the estimate it was saved with, 5 MET for the minutes (ADR 0021), which knows nothing of how hard the workout was.

## Decision

- **The samples are kept with the log,** as `workout_logs.heart_rate_samples`: one every 10 seconds from the start, in beats a minute, none where nothing measured it, 12 hours at most. They arrive with a whole read through `set_workout_health()` (ADR 0099). Values no person can have are dropped, and an array longer than the workout is refused. A later read without samples keeps them.
- **Each set keeps when it was done** (`logged_sets.done_at`), from the phone's clock, if it falls within its workout, so that the chart can mark the sets. An edit keeps a set's time at its place. Sets logged before this, or added in an edit, have none.
- **Calories are estimated from the heart rate** (`workout_logs.heart_rate_kcal`), by Keytel et al. (2005), from the average heart rate, the minutes and the user's age, sex and weight on the workout's day. For a sex not given, the mean of the two formulas is used. Like the 5 MET estimate, it counts all the calories burned. The app shows the watch's own calories when there are any, then this estimate marked as such, then the 5 MET one.

## Alternatives considered

- **Reading the samples from the store when the screen opens:** nothing more is kept, but the chart shows only on the phone that has the data, only while the store keeps it, and never for Bite.
- **Every sample, unthinned:** a watch can write one a second, many times more rows than a chart can show.
- **Estimating only active calories, without resting:** it needs the resting rate, which the app does not have, and would not match the 5 MET estimate shown otherwise.

## Consequences

- The chart shows on every device, and the samples go with the account when it is deleted.
- More health data is kept: the privacy policy (#44) and Google Play's Health declaration name the heart rate over a workout's time.
- Keytel's formula fits steady exercise best. For strength training it is a rough figure, which is why the app marks it as estimated.
