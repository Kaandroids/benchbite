# Media

The screenshots and GIFs in the README. They are taken on the iOS Simulator
(iPhone 17 Pro) against the local Supabase stack, with a demo account and no real data.

| File                   | Shows                                                           |
| ---------------------- | --------------------------------------------------------------- |
| `onboarding.gif`       | The onboarding, from the welcome screen to the finished plan    |
| `workout-create.gif`   | Making a workout: name, days, exercises from the library, sets  |
| `today.png`            | Today: the week, the daily target and the next workout          |
| `workout.png`          | Workouts: the active workouts and this week's history           |
| `nutrition.png`        | Nutrition: the day's meals, macros and water                    |
| `progress.png`         | Progress: the weight over three months and last month's summary |
| `bite.png`             | Bite turning a message into a meal card                         |
| `bite-proposal.png`    | Bite noting an injury and proposing to swap an exercise         |
| `workout-active.png`   | A workout in progress, with last time's sets and the rest timer |
| `workout-finished.png` | A finished workout, with the watch's heart rate and its sets    |
| `today-dark.png`       | Today in dark mode                                              |
| `watch-set.png`        | The Apple Watch app at the set to do next                       |
| `watch-rest.png`       | The Apple Watch app counting a rest down                        |
| `watch-summary.png`    | The Apple Watch app's summary of a saved workout                |

## The demo account

`pnpm seed:demo` deletes and recreates `kaan.demo@benchbite.local` (password `benchbite-demo`)
in the local stack: a man of 192 cm going from 100 kg to 90 kg, mostly sitting, with an
intermediate upper/lower plan on Monday, Tuesday, Thursday and Friday. It logs 44 days of
workouts, meals, water and weights up to today, and a 40-day streak. Each workout has the heart
rate and active calories of a watch, so a finished workout shows its heart rate chart with its
sets. Run it on the day you take the screenshots, as the history ends on the day it runs. The data
follows the weekdays, so it differs from one run date to another: the screenshots here were taken
on a Saturday, a rest day.
On a training day, today's workout is logged in the morning; run the seed after about 8:00 UTC. It needs the stack and
the Edge Functions running, and gives the account an AI budget so that Bite answers; Bite also
needs `GEMINI_API_KEY` (see [Development](../development.md)).

## Taking the screenshots

1. Start Metro without the developer tools, so that no developer buttons show:
   `set -a; . ./.env.local; set +a; EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SENTRY_DSN= pnpm start --no-dev --minify --clear`.
   Without `--no-dev`'s development tools, Expo also reads `.env.production.local`, which points at
   the hosted project: the variables set here keep the app on the local stack and out of Sentry.
   In the development build's menu, turn off the tools button.
2. Log in as the demo account in the simulator (Settings → Log in). After running the seed again,
   log out first: the old session belongs to the deleted account.
3. Give the status bar a fixed time and full bars:
   `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
4. Take each screen with `xcrun simctl io booted screenshot <file>.png`, then shrink it to
   1200 px high: `sips -Z 1200 <file>.png`. With a watch or a second iPhone simulator booted, put
   the iPhone's id from `xcrun simctl list devices booted` in place of `booted`, here and in step 3.
5. For `bite.png`, ask Bite "Just had 3 eggs, two slices of toast and a coffee with milk for
   lunch. Can you log it?", and leave the card unadded. For `bite-proposal.png`, ask in the same
   chat "My left shoulder hurts on overhead presses. Can you swap them out of my upper body
   workout?", and keep the plan as it is. For `workout-finished.png`, open the last workout in the
   history. For `workout-active.png`, start Upper body and tick the first set; discard the workout
   afterwards.

## The App Store screenshots

`pnpm store:screenshots` draws the App Store's screenshots (#557) from the screens in
`store/source/<language>/`: the 6.9" iPhone size, 1320 × 2868, without transparency, a caption
above each screen with one word in the brand's colour, a part of it enlarged and, on some, Bite.
The captions, the parts and Bite's faces are in `scripts/store-screenshots.ts`. The screenshots go
to `store/out/<language>/`, which Git does not keep: draw them again to upload them.

Take each screen as above, with the app in that language (Settings → Language), on the iPhone 17
Pro Max simulator at full size, and without the device's outline, which would draw the Dynamic
Island: `xcrun simctl io <id> screenshot --mask=ignored store/source/<language>/<file>.png`.
The files and what they show:

| File                   | Shows                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `1-today.png`          | Today                                                                                                     |
| `2-workout.png`        | Upper body with the first set at 77.5 kg × 12 and the second at 80 kg × 10, a new record; discarded after |
| `3-nutrition.png`      | Nutrition                                                                                                 |
| `4-bite-meal.png`      | A new chat: the photo `store/photos/salmon-poke-bowl.jpg` and the message below, its card unadded         |
| `5-bite-remembers.png` | A new chat: the shoulder message below, the plan kept as it is                                            |
| `6-workout-watch.png`  | The last workout in the history, with the watch's heart rate                                              |
| `7-progress.png`       | Progress                                                                                                  |
| `8-today-dark.png`     | Today, with the simulator in dark mode (`xcrun simctl ui <id> appearance dark`)                           |

The messages to Bite, in each language:

- English: "Here's my lunch. I also had a green smoothie, about 200 ml. Can you log it?" and "My
  left shoulder hurts on overhead presses. Can you swap them out of my upper body workout?"
- German: "Hier ist mein Mittagessen. Dazu hatte ich einen grünen Smoothie, etwa 200 ml. Kannst du
  es eintragen?" and "Meine linke Schulter schmerzt beim Überkopfdrücken. Kannst du das aus meinem
  Oberkörper-Training nehmen?"
- Turkish: "Öğle yemeğim bu. Bir de yaklaşık 200 ml yeşil smoothie içtim. Kaydeder misin?" and
  "Sol omzum baş üstü preslerde ağrıyor. Üst vücut antrenmanımdan çıkarabilir misin?"

Add the photo to the simulator first: `xcrun simctl addmedia <id> store/photos/salmon-poke-bowl.jpg`.
It is "Salmon Poke Bowl (S) with Spicy mayo sauce - Kitokito" by Andy Li, given to the public
domain under [CC0 1.0](<https://commons.wikimedia.org/wiki/File:Salmon_Poke_Bowl_(S)_with_Spicy_mayo_sauce_-_Kitokito.jpg>).
Bite's answers differ from one try to the next: take one whose words are whole and whose photo
and card fit on the screen.

## Taking the watch's screenshots

The simulators pass the phone's states to the watch but not the watch's commands to the phone, so
a watch there never follows a workout. A debug build of the watch app shows a sample instead,
given at launch (`targets/watch/Sample.swift`): `scripts/watch-sample.ts` prints a workout like the
demo account's Upper body at a set (`set`), in a rest (`rest`) or saved (`summary`).

1. Build with `pnpm ios` and install the watch app on an Apple Watch simulator (46 mm), as
   [Development](../development.md#the-apple-watch-app) says.
2. Launch it with a sample, `<scene>` being `set`, `rest` or `summary`; the locale gives the
   numbers a decimal point:

   ```bash
   SIMCTL_CHILD_BENCHBITE_SAMPLE="$(node scripts/watch-sample.ts <scene>)" \
     xcrun simctl launch <watch simulator id> com.benchbite.app.dev.watchkitapp -AppleLocale en_US
   ```

3. Take it with `xcrun simctl io <watch simulator id> screenshot docs/media/watch-<scene>.png`.
   Before the next scene, end the app:
   `xcrun simctl terminate <watch simulator id> com.benchbite.app.dev.watchkitapp`.

## Recording the GIFs

With [idb](https://fbidb.io), [ffmpeg](https://ffmpeg.org) and [gifski](https://gif.ski)
installed, record the onboarding with the app on the welcome screen as a new guest, then making a
workout with the app on the Workouts tab. They record the booted iPhone simulator; with several
booted, set `UDID` to the one to record.

```bash
scripts/record-onboarding.sh onboarding.mov
scripts/record-workout.sh workout-create.mov
```

Then turn each into a GIF, `<name>` being `onboarding` or `workout-create`. The first 2 seconds
and the status bar are cut, and the GIF plays at twice the real speed:

```bash
mkdir -p frames && rm -f frames/*
ffmpeg -ss 2 -i <name>.mov \
  -vf "crop=iw:ih-162:0:162,setpts=PTS/2,fps=12,scale=300:-1:flags=lanczos" frames/f%04d.png
gifski --fps 12 --width 300 --quality 80 -o docs/media/<name>.gif frames/f*.png
```
