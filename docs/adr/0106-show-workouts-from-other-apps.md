# 0106. Show workouts from other apps

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Users also run, ride or go to classes, and a watch or another app records these in Apple Health or Health Connect. Benchbite reads the store already (ADR 0097) and keeps the day's steps from it (ADR 0103). Showing these workouts next to Benchbite's own gives a fuller picture of the week (#468). The streak (ADR 0042, ADR 0044) and the week's count are built on the workouts the user planned in Benchbite.

## Decision

- **Kept on the server, read like steps.** `outside_workouts` keeps each workout from the store with its activity, start, end, the device's day it started on, active calories, average heart rate and the app that recorded it. Only `import_outside_workouts(workouts, health_store, since, until, today)` writes them, for the caller, and no user keeps more than 3000 from the last 400 days, far more than anyone records; older ones stay without counting, so a user of many years is never stopped. Users read their own rows, and no one writes them directly, so History, Today and later Bite read the same list.
- **The store is the truth for the time read.** Each import gives every workout that started in the store from `since` until before `until`, at most 500, so a longer time is read in parts. Rows of the same store from that time that are not given are taken out, as the user deleted or changed them there. A phone with the other store keeps its own rows, but one phone per store is the truth: two Android phones, each with its own Health Connect, would take out each other's workouts.
- **Workouts the same as a Benchbite workout are not shown.** The app never reads Benchbite's own copies (ADR 0105). A watch's workout that covers more than half of a logged workout's time is that workout, as its heart rate and calories already show on it. The view `outside_workout_list` leaves it out, so a log added later hides it too.
- **Shown, not counted.** They do not count toward the streak or the week's workouts, which follow the planned Benchbite workouts. A run does not stand in for a planned strength workout. Their calories are not added to the day's target, as the activity level already counts such movement (ADR 0103).
- **Reading workouts is asked for on its own,** as weight and steps are (ADR 0100, ADR 0103): a card on History asks once. The app reads the last 30 days the first time and goes on from the day last read, as for steps.

## Alternatives considered

- **Counting them toward the streak or the week:** a run would stand in for a planned strength workout, and the streak would mean something else for users with a watch.
- **Adding their calories to the day's target:** counts the movement twice with the activity level, and makes the target move during the day.
- **Reading the store each time a screen opens:** Bite could not see them, and the history could not page through them with the logs.
- **Hiding the overlap when importing:** a workout logged later would not hide the watch's copy of it.

## Consequences

- History and Today show the week as the user lived it, while the streak and the week's count stay as they were.
- The privacy policy (#44) and Google Play's Health declaration name workouts among the data read.
- A workout deleted in the store disappears at the next read that covers its time.
- A user with two phones on the same store sees the workouts of the phone that read last.
