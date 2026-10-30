# Architecture Decision Records

This folder records significant decisions about the project: what was decided, why, and what it costs.
The format follows [Michael Nygard's ADR template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Writing a new ADR

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` with the next number.
2. Fill it in and add it to the index below.
3. Submit it in the same pull request that introduces the decision.

ADRs are not edited after they are accepted. To change a decision, write a new ADR
and mark the old one as `Superseded by ADR-NNNN`.

## Index

| ADR                                                          | Title                                                                                   | Status                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------- |
| [0001](0001-react-native-and-supabase.md)                    | Use React Native with Expo and Supabase                                                 | Accepted                      |
| [0002](0002-single-expo-project-at-the-root.md)              | Keep a single Expo project at the repository root                                       | Accepted                      |
| [0003](0003-local-first-database-development.md)             | Develop the database against a local Supabase stack                                     | Accepted                      |
| [0004](0004-auth-session-storage.md)                         | Store the auth session with expo-sqlite's localStorage                                  | Accepted                      |
| [0005](0005-guest-first-accounts.md)                         | Let people start as guests with anonymous sign-ins                                      | Accepted                      |
| [0006](0006-styling-with-stylesheet-and-tokens.md)           | Style the app with StyleSheet and theme tokens                                          | Accepted                      |
| [0007](0007-internationalization.md)                         | Translate the app with i18next and default units from the device                        | Accepted                      |
| [0008](0008-exercise-library.md)                             | Import free-exercise-db as the exercise library                                         | Accepted                      |
| [0009](0009-nutrition-targets.md)                            | Calculate nutrition targets in Postgres on every read                                   | Accepted                      |
| [0010](0010-plan-builder-edge-function.md)                   | Build the starter workout plan in an Edge Function from fixed rules                     | Accepted                      |
| [0011](0011-onboarding-flow.md)                              | Guide new users through an onboarding flow kept on the device until it is finished      | Accepted                      |
| [0012](0012-local-workout-reminders.md)                      | Remind people to train with local notifications                                         | Superseded by ADR-0029        |
| [0013](0013-onboarding-written-by-definer-function.md)       | Write the onboarding only through a function with its owner's rights                    | Accepted                      |
| [0014](0014-native-tab-bar.md)                               | Use the system's tab bar for the main screens                                           | Superseded by ADR-0048        |
| [0015](0015-server-data-with-tanstack-query.md)              | Load and cache the user's data with TanStack Query                                      | Accepted                      |
| [0016](0016-workouts-instead-of-a-weekly-plan.md)            | Store workouts on weekdays instead of one weekly plan                                   | Accepted                      |
| [0017](0017-save-workouts-through-a-function.md)             | Save workouts through a function that checks their targets                              | Accepted                      |
| [0018](0018-per-user-limits-come-from-the-database.md)       | Per-user limits come from the database                                                  | Accepted                      |
| [0019](0019-plans-repeat-workouts.md)                        | Plans repeat a workout on every day of its kind                                         | Accepted                      |
| [0020](0020-log-finished-workouts.md)                        | Log a workout once it is finished                                                       | Accepted                      |
| [0021](0021-estimate-calories-when-a-workout-is-saved.md)    | Estimate the calories of a workout when it is saved                                     | Accepted                      |
| [0022](0022-no-finishers.md)                                 | Workouts have no finisher                                                               | Accepted                      |
| [0023](0023-edit-a-finished-workout.md)                      | Edit a finished workout by replacing its sets                                           | Accepted                      |
| [0024](0024-records-calculated-from-logged-sets.md)          | Calculate records from the logged sets when they are read                               | Accepted                      |
| [0025](0025-notice-new-records-on-the-device.md)             | Notice new records on the device while logging                                          | Accepted                      |
| [0026](0026-custom-exercises-live-in-the-exercises-table.md) | Keep custom exercises in the exercises table, with an owner                             | Accepted                      |
| [0027](0027-private-exercise-photos.md)                      | Keep the photos of custom exercises private, shown through signed URLs                  | Accepted                      |
| [0028](0028-move-workouts-within-their-week.md)              | Move workouts within their week, with several workouts a day                            | Accepted                      |
| [0029](0029-schedule-reminders-from-the-week.md)             | Schedule workout reminders from the week as it is                                       | Accepted                      |
| [0030](0030-deploy-supabase-from-github-actions.md)          | Deploy Supabase from GitHub Actions                                                     | Accepted                      |
| [0031](0031-email-and-password-accounts.md)                  | Create accounts with an email address and a password                                    | Accepted                      |
| [0032](0032-animated-splash-over-a-static-native-splash.md)  | Animate the splash in the app, over a static native splash                              | Accepted                      |
| [0033](0033-food-library-from-bls.md)                        | Build the food library from the BLS 4.0                                                 | Accepted                      |
| [0034](0034-meal-entries-with-copied-values.md)              | Log meals as entries with copied values, per local day and fixed meal                   | Accepted                      |
| [0035](0035-search-foods-in-postgres.md)                     | Search foods in Postgres, by name in the user's language and in English                 | Accepted                      |
| [0036](0036-foods-of-ones-own.md)                            | Let people add foods of their own, private and archived on delete                       | Accepted                      |
| [0037](0037-frequent-and-favourite-foods.md)                 | Count frequent foods from the entries, and keep favourites in a table                   | Accepted                      |
| [0038](0038-recipes.md)                                      | Sum recipes from their ingredients and log them by the serving                          | Accepted                      |
| [0039](0039-own-nutrition-targets.md)                        | Let people set their own targets and work the calculated ones out again                 | Accepted                      |
| [0040](0040-day-nutrition-targets.md)                        | Keep each day's targets with the day                                                    | Accepted                      |
| [0041](0041-keep-each-days-planned-workouts.md)              | Keep each day's planned workouts with the day                                           | Accepted                      |
| [0042](0042-daily-streak-rules.md)                           | Count streak days by workouts and calories, and freeze by choice                        | Accepted, amended by ADR-0044 |
| [0043](0043-past-weeks-on-the-week-strip.md)                 | Page the week strip back to the account's first week, to read only                      | Accepted, amended by ADR-0046 |
| [0044](0044-streak-calories-and-workout-days.md)             | Count a day's calories up to its target, and keep the device's day of each workout      | Accepted                      |
| [0045](0045-long-breaks-end-by-themselves.md)                | A break reaching back more than a week ends by itself                                   | Accepted                      |
| [0046](0046-past-weeks-show-their-workouts-and-meals.md)     | A past week shows its workouts, its days' macros and a summary                          | Accepted                      |
| [0047](0047-the-progress-tab.md)                             | The Progress tab: weight, eating and training over a range, then records and the streak | Accepted                      |
| [0048](0048-our-own-tab-bar-with-bite.md)                    | Draw our own tab bar, with Bite in its middle                                           | Accepted                      |
| [0049](0049-gemini-behind-our-own-model-interface.md)        | Gemini behind our own language model interface                                          | Accepted, amended by ADR-0051 |
| [0050](0050-bites-conversations-in-threads.md)               | Bite's conversations in threads, written only by the chat function                      | Accepted                      |
| [0051](0051-ai-usage-and-a-monthly-limit.md)                 | What AI costs, and a limit per user and month                                           | Accepted                      |
| [0052](0052-the-coach-chat-function.md)                      | Bite answers in a stream of events, from a prompt, a snapshot and read tools            | Accepted                      |
| [0053](0053-bite-errs-on-the-safe-side.md)                   | Bite errs on the safe side when the snapshot is missing or unsafe                       | Accepted                      |
| [0054](0054-a-pace-the-user-can-keep.md)                     | A pace the user can keep, and the date it really gives                                  | Accepted                      |
| [0055](0055-bite-s-chat-history.md)                          | Bite's chat history: named by the first message, opened by recency                      | Accepted                      |
| [0056](0056-count-a-call-after-its-place-is-taken.md)        | A model call's input is counted after its place is taken                                | Accepted                      |
| [0057](0057-stop-bite-on-the-server-too.md)                  | Stop Bite's answer on the server too                                                    | Accepted                      |
