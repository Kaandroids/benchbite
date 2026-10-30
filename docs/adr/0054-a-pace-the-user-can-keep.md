# 0054. A pace the user can keep, and the date it really gives

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

The pace slider offered everyone 0.25–0.9 kg (0.5–2 lb) a week of loss: 0.9 kg is about the most
a deficit of 1000 kcal a day gives, the most the targets take off (ADR 0009). The app judges a
pace by its share of body weight (`paceLevel`): up to 1% a week ideal, up to 1.5% ambitious, more
aggressive. For a light user, 0.9 kg is aggressive (1.6% at 55 kg), yet it could be picked.

The targets also never go below the calorie floor (1,200–1,500 kcal). When the floor holds them
up, the deficit is smaller than the pace asks for: a sedentary 60 kg woman who picks 0.9 kg gets
1,200 kcal, about 0.56 kg a week. Every date the app showed for the goal, on the plan, the
summary, Daily goals and the weight card, still came from the chosen pace, so the goal came about
1.6 times later than promised.

## Decision

- **The slider stops at 1.5% of body weight a week**, on its steps, where that comes before
  0.9 kg (`paceRange`), so that a pace the app calls aggressive cannot be picked. At the stop, the
  note says it is the fastest pace for the user's weight. Goals to gain keep their range.
- **The database works out the pace the targets really give**, from the same calculation:
  `achievable_weekly_pace_kg()` for answers not yet saved (the onboarding) and
  `my_achievable_weekly_pace_kg()` for the saved goal. It is the chosen pace, unless the floor
  holds the calories up; then it is the difference to maintenance, at 7,700 kcal a kilogram.
- **Every date of the goal uses that pace.** Where it is slower than the chosen one, the plan and
  Daily goals say why: the calories stay at the floor, and moving more makes it faster.
- **The healthy body mass index and the pace levels are one file**, `_shared/body/limits.ts`,
  which the app and Bite (ADR 0053) both use.

## Alternatives considered

- **Also stopping the slider where the floor would hold the targets up:** the onboarding asks
  for the pace before the activity, so the floor's limit is not known yet, and moving the step
  would change the onboarding's order. The real pace is shown once the activity is known instead.
- **Keeping the slider and only warning:** the label already said aggressive, and people picked
  it anyway; a pace the app would not recommend is better not offered.
- **A pace limit in the database:** the pace is checked against the weight, which changes, and
  the targets already cap the deficit at 1000 kcal and the calories at the floor, so a saved
  pace cannot make the targets unsafe. The database keeps its 1.5 kg a week limit.

## Consequences

A light or inactive user sees a later date than before, but one the targets can keep. The
weight card's date follows the latest weight only when the goal's data is read again. The
1.5% stop and the levels live in one file; the floor and the 7,700 kcal stay in the database.
