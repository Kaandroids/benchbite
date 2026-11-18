# 0144. Delete the logs when the health data consent is withdrawn

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Benchbite rests on the consent to process health data that the onboarding asks for (GDPR Art. 9):
the profile, the plan and every log of workouts, meals, weight, water and steps. A consent must be as
easy to withdraw as to give (Art. 7(3)), and data with no other basis must then be deleted
(Art. 17(1)(b)). Until now only deleting the account did that. The app (#652) and the website (#653)
will offer the withdrawal; deleting the account stays a separate choice, as it also ends the
subscription.

## Decision

- **One function, `withdraw_health_consent()`,** called via `rpc()`, does everything in one
  transaction. It refuses a user with no current consent (BB062). Like the AI consent (ADR 0143),
  the withdrawal is recorded in a table of its own, `health_data_consent_withdrawals`, never
  changed, and only a consent given after the last withdrawal counts.
- **The AI consent ends with it.** Bite works on the same data, so the withdrawal also withdraws
  the AI consent and deletes Bite's chats and notes, through `end_ai_consent()`, which
  `withdraw_ai_consent()` now shares.
- **Deleted:** the profile, goal, weights and targets; meals, water and steps; workout logs with
  their sets, workouts with their exercises and alternatives, the plan's days and moves; streaks.
  The app then starts the onboarding again on every device (part 2 of #652).
- **Nothing is written again while it is withdrawn.** Another phone of the user, or an import
  running at that moment, would otherwise write their health data again, and an AI consent given
  afterwards would send it to the model. A trigger on each table that rests on the consent, and on
  `ai_consents`, refuses a row while the consent is withdrawn and not given again (BB063); a lock
  makes the withdrawal and such a write wait for each other, taken after the plan's limits as other
  writes take them. Left out are `removed_meal_entries`, which the withdrawal itself writes, and
  `applied_plans`, the plan's limits, which hold no health data and which the subscription writes
  again. A user gives only their own AI consent, its user taken from the session, so that the
  refusal cannot tell one user whether another withdrew theirs. Users who never consented, as before
  the onboarding, are not held. `complete_onboarding()` saves the consent first, so the onboarding
  can be done again.
- **Kept, as they have another basis:** the account and its subscription (the contract);
  `ai_usage`; the consents, acceptances and withdrawals (the proof, Art. 7(1)); what deleting the
  account and changing its password keep.
- **The user's own library stays:** their foods, recipes, favourites and exercises. They describe
  food and exercises, not the user's body or what they did, and they serve the user who starts
  again. Their exercise photos have no purge outside deleting the account, which is one more reason
  to keep them.

## Alternatives considered

- **Delete the account.** It would end the subscription and the sign-in with it; a user who only
  withdraws the consent may want to start again.
- **Delete the library too.** It holds no health data, and custom exercises would leave their photos
  behind in storage.
- **Keep the logs and stop only new processing.** Withdrawal ends the only basis for keeping them.

## Consequences

- The app and the website only call the function and say beforehand what it deletes. The app
  treats BB063 as a withdrawn consent and shows the onboarding, also on a device that did not
  withdraw it.
- A test checks that no table with a `user_id`, other than those kept on purpose, holds a row of the
  user after the withdrawal, so a table added later must be deleted here or kept on purpose.
- Deleted data stays in the database's backups until they expire, as in ADR 0143.
