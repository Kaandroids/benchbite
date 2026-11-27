# The stores' privacy details

What to answer in App Store Connect (App Privacy) and in Google Play Console (Data safety, Health
apps), from what the app and Bite collect. The privacy manifest in `app.json`
([ADR 0155](adr/0155-declare-encryption-and-data-use-to-apple.md)), the privacy policy on the
website and these answers say the same: a change to what the app collects changes all three.

## What the app collects

| Data                                                                                              | Where it comes from                                                       | Kept                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Sex, birth year, height, weight, activity, goals and targets                                      | onboarding and the profile; the calorie targets come from them            | with the account                                             |
| Workouts, sets, plans, steps, water, meals and foods                                              | logged in the app, or read from Apple Health and Health Connect when on   | with the account                                             |
| Heart rate and active calories of workouts                                                        | Apple Health, Health Connect, the Apple Watch app                         | with the account                                             |
| Name                                                                                              | the name the user gives Bite and the profile (`display_name`)             | with the account                                             |
| Email address                                                                                     | an account, which is optional (guests have none)                          | with the account                                             |
| User id                                                                                           | Supabase Auth, guests too                                                 | with the account                                             |
| Photos                                                                                            | of the user's own exercises, of meals for Bite's estimate, in Bite's chat | exercises: with the account; Bite's: 30 days after the chat  |
| Voice messages                                                                                    | Bite's chat                                                               | 30 days after the chat                                       |
| Messages to Bite, Bite's notes, own foods and recipes                                             | written in the app                                                        | chat: 30 days after the last message; the rest: with account |
| What each request to the AI used                                                                  | the Edge Functions, for the monthly allowance                             | per user and month                                           |
| Crash reports and JavaScript errors, scrubbed of personal data on the phone and by Sentry's rules | Sentry ([ADR 0149](adr/0149-report-crashes-and-errors-to-sentry.md))      | Sentry's retention, not linked to the account                |

Not collected: location, contacts, advertising or device ids, browsing history, search history
outside the app, purchases (until #434), push tokens (reminders are local notifications). Nothing
is used for tracking or advertising, and nothing is sold or shared beyond the service providers
that process it for the app (Supabase, Google Vertex AI for Bite, Sentry, Lettermint, Cloudflare).

## App Store Connect: App Privacy

**Do you or your third-party partners collect data from this app?** Yes.

For every type below: **Used for** App Functionality only. **Linked to the user** as stated.
**Used for tracking** no.

| Category         | Type                  | Linked |
| ---------------- | --------------------- | ------ |
| Health & Fitness | Health                | yes    |
| Health & Fitness | Fitness               | yes    |
| Contact Info     | Name                  | yes    |
| Contact Info     | Email Address         | yes    |
| Identifiers      | User ID               | yes    |
| User Content     | Photos or Videos      | yes    |
| User Content     | Audio Data            | yes    |
| User Content     | Other User Content    | yes    |
| Usage Data       | Other Usage Data      | yes    |
| Diagnostics      | Crash Data            | no     |
| Diagnostics      | Other Diagnostic Data | no     |

Leave every other type unticked. The privacy policy URL is `https://www.benchbite.com/privacy`.

HealthKit has no question of its own here; App Review checks it against guideline 5.1.3: health
data is not used for advertising, not kept in iCloud, and the app says why it reads and writes it
(`NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` in `app.json`).

## Google Play Console: Data safety

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS only).
- **Do you provide a way for users to request that their data is deleted?** Yes: in the app
  (Settings → Account → Delete account) and on `https://www.benchbite.com/delete-account`.
- **Shared:** none. The service providers above process data for the app, which Play does not
  count as sharing.

Each type is **collected**, **not processed ephemerally**, for **App functionality**:

| Category                 | Type                         | Required or optional                     |
| ------------------------ | ---------------------------- | ---------------------------------------- |
| Personal info            | Name                         | optional                                 |
| Personal info            | Email address                | optional (an account)                    |
| Personal info            | User IDs                     | required                                 |
| Health and fitness       | Health info                  | required (the targets)                   |
| Health and fitness       | Fitness info                 | required                                 |
| Photos and videos        | Photos                       | optional                                 |
| Audio                    | Voice or sound recordings    | optional                                 |
| App activity             | Other user-generated content | optional                                 |
| App activity             | Other actions                | optional (Bite's use, for its allowance) |
| App info and performance | Crash logs                   | optional (only when the app crashes)     |
| App info and performance | Diagnostics                  | optional                                 |

## Google Play Console: Health apps and Health Connect

- **Health apps declaration:** Fitness and exercise (workout tracking), Nutrition and weight
  management. Not a medical device, no medical advice.
- **Health Connect permissions,** the seven in `app.json`, each with its reason:

| Permission                     | Why                                                                     |
| ------------------------------ | ----------------------------------------------------------------------- |
| `READ_HEART_RATE`              | shows how hard a workout was                                            |
| `READ_ACTIVE_CALORIES_BURNED`  | shows a workout's active calories                                       |
| `READ_WEIGHT`                  | keeps the weight and its progress up to date                            |
| `READ_STEPS`                   | shows the day's steps                                                   |
| `READ_EXERCISE`                | shows workouts other apps recorded, and saves one a watch recorded once |
| `WRITE_EXERCISE`               | saves a finished workout to Health Connect, when the user turns it on   |
| `WRITE_ACTIVE_CALORIES_BURNED` | saves that workout's active calories with it                            |

Health Connect data is used only for these features, never for advertising, and not passed on
except to the service providers above, as Health Connect's policy allows.
