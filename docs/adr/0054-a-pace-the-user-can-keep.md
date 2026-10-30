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
  0.9 kg (`paceRange`), so that a pace the app calls aggressive cannot be picked, in either
  unit once saved in kilograms. At the stop, the note says it is the fastest pace for the
  user's weight. Goals to gain keep their range.
- **The database works out the pace of loss the targets really give**, from the targets
  themselves: the calories that keep the weight less those of the goal, at 7,700 kcal a
  kilogram (`weekly_loss_kg()`). `achievable_weekly_pace_kg()` does it for answers not yet saved
  (the onboarding), `my_achievable_weekly_pace_kg()` for the saved goal. It is 0 when the floor
  holds the calories at what keeps the weight, and null for a goal that does not lose weight,
  which the floor never holds back, or while the user's own targets are in use, of which the
  calculated ones say nothing; the chosen pace dates the goal then.
- **Every date of the goal uses that pace** (`goalPace`), where the floor holds it below the
  chosen one; within rounding, the chosen one. Where it is slower, the plan and Daily goals say
  why: the calories stay at the floor, and moving more makes it faster. Where it is 0, there is
  no date, and they say the calories keep the weight.
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
1.5% stop and the levels live in one file; the floor and the 7,700 kcal stay in the database,
where `weekly_loss_kg()` names the `kcal_per_kg` of `calculate_nutrition_targets()` it repeats.
Bite's snapshot gives the achievable pace too, marked when the floor holds it below the chosen
one, and Bite dates and plans by it, so that it never gives a date unlike the app's (#338).
