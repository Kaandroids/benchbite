# 0053. Bite errs on the safe side when the snapshot is missing or unsafe

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Bite's safety rules (ADR 0052) work from the snapshot: the calorie floor, the goal and the
targets. A review of the prompt found four gaps. When the profile could not be read, the floor
was left out, and the rules only held "if the snapshot says". The snapshot said every user was
not pregnant or breastfeeding, though the app does not ask and the column only holds its default.
Targets the user set themselves may go down to 800 kcal, below the floor of 1200–1500 kcal, and
goals allow a target weight of 30 kg and 1.5 kg a week; the snapshot gave them as plain data,
leaving the model to see the danger. And the user's message followed the snapshot without a
boundary, so it could carry a forged snapshot.

## Decision

- **Unknown is unsafe.** Without a profile, the snapshot says so, and the rules then give no
  weight loss numbers; Bite is told the highest floor, 1500 kcal.
- **Pregnancy is not known.** The snapshot no longer says whether the user is pregnant or
  breastfeeding. The rules say the app does not ask, and that a user who says so gets no weight
  loss advice and is referred to their doctor.
- **The snapshot marks what is unsafe, as the app judges it.** Targets below the user's floor are
  marked; with the floor unknown, those below the lowest floor (1200 kcal), which is below every
  user's. A goal that loses weight, by its kind or by a target below the latest weight, is
  marked when its target gives a body mass index under 18.5, and its pace by the app's levels:
  ambitious over 1% of body weight a week, too fast over 1.5%. What cannot be checked, without a
  height or a weight, is marked as not checked. The rules say not to coach toward low targets or
  a goal too low or too fast, and to be gentle, as with signs of an eating disorder; an
  ambitious pace may be planned for, with a word that a slower one keeps more muscle; a goal not
  checked gets no numbers. A goal to gain is not marked: an underweight user gaining is what is
  wanted.
- **The limits are shared.** The healthy body mass index and the pace levels are in
  `_shared/body/limits.ts`, which the app's goal screens and Bite both use, so that a pace the
  app calls ambitious is ambitious to Bite too.
- **The user's words are fenced.** The message goes between `<message>` and `</message>`. In it,
  in earlier messages, Bite's included, in the snapshot's lines and in what the tools return,
  every `<` gives way to `‹`, after the text is normalised and characters that do not show are
  taken out, so that no spelling of a tag gets through. The rules say only the snapshot of the
  latest message is the user's state.

## Alternatives considered

- **Failing the answer when the profile cannot be read:** safe, but Bite would go quiet over a
  passing error, for questions that need no profile.
- **Asking about pregnancy:** the app decided not to ask; telling the model the user is not
  pregnant, when nobody asked, would be worse than saying nothing.
- **Keeping own targets at the floor in the database:** it would change what people may set in
  Nutrition, some under a doctor's care; the Nutrition screen warns instead (#331).
- **Calling every pace over 1% too fast:** the app offers up to 1.5% as ambitious, so Bite would
  treat a pace the user chose as fine like a warning sign.
- **Only telling the model to check the numbers itself:** it can miss them, and marks in the data
  cost a few tokens.

## Consequences

Bite stays within the rules when data is missing, at the price of refusing weight loss numbers
until the profile can be read. The floors Bite falls back on are pinned to `calorie_floor()` by
a database test, and the body limits are one file for the app and Bite.
