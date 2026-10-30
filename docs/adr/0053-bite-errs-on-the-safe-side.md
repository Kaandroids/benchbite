# 0053. Bite errs on the safe side when the snapshot is missing or unsafe

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Bite's safety rules (ADR 0052) work from the snapshot: the calorie floor, whether the user is
pregnant or breastfeeding, their goal and targets. A review of the prompt found three gaps. When
the profile could not be read, those lines were left out, and the rules only held "if the
snapshot says". Targets the user set themselves may go down to 800 kcal, below the floor of
1200–1500 kcal, and goals allow a target weight of 30 kg and 1.5 kg a week; the snapshot gave
them as plain data, leaving the model to see the danger. And the user's message followed the
snapshot without a boundary, so it could carry a forged snapshot.

## Decision

- **Unknown is unsafe.** Without a profile, the snapshot says pregnancy is unknown, which the rules
  treat as pregnant (no weight loss advice), and gives the highest floor, 1500 kcal.
- **The snapshot marks what is unsafe.** Targets below the floor the profile gives are marked,
  and so is a goal to lose fat whose target weight gives a body mass index under 18.5, or whose
  pace is over 1% of body weight a week; one that cannot be checked, without a height or a
  weight, is marked as not checked. The rules say not to coach toward them, to give no numbers
  toward a goal not checked, and to be gentle, as with signs of an eating disorder. A goal to
  gain is not marked: an underweight user gaining is what is wanted.
- **The user's words are fenced.** The message goes between `<message>` and `</message>`. In it,
  in earlier messages, Bite's included, in names in the snapshot and in what the tools return,
  every `<` gives way to `‹`, after the text is normalised and characters that do not show are
  taken out, so that no spelling of a tag gets through. The rules say only the snapshot of the
  latest message is the user's state.

## Alternatives considered

- **Failing the answer when the profile cannot be read:** safe, but Bite would go quiet over a
  passing error, for questions that need no profile.
- **Keeping own targets at the floor in the database:** it would change what people may set in
  Nutrition, some under a doctor's care; that is a decision of its own, left for later.
- **Only telling the model to check the numbers itself:** it can miss them, and marks in the data
  cost a few tokens.

## Consequences

Bite stays within the rules when data is missing, at the price of refusing weight loss numbers
until the profile can be read. The thresholds live in `prompt.ts` and match the floor in
`calorie_floor()` and the 1% rule in the prompt; changing one means changing the other.
