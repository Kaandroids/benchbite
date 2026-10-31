# Media

The screenshots and the onboarding GIF in the README. They are taken on the iOS Simulator
(iPhone 17 Pro) against the local Supabase stack, with a demo account and no real data.

| File                 | Shows                                                           |
| -------------------- | --------------------------------------------------------------- |
| `onboarding.gif`     | The onboarding, from the welcome screen to the finished plan    |
| `today.png`          | Today: the week, the daily target and the next workout          |
| `workout.png`        | Workouts: the active workouts and this week's history           |
| `nutrition.png`      | Nutrition: the day's meals, macros and water                    |
| `progress.png`       | Progress: the weight over three months and last month's summary |
| `bite.png`           | Bite turning a message into a meal card                         |
| `workout-active.png` | A workout in progress, with last time's sets and the rest timer |
| `today-dark.png`     | Today in dark mode                                              |

## The demo account

`pnpm seed:demo` deletes and recreates `kaan.demo@benchbite.local` (password `benchbite-demo`)
in the local stack: a man of 192 cm going from 100 kg to 90 kg, mostly sitting, with an
intermediate upper/lower plan on Monday, Tuesday, Thursday and Friday. It logs 44 days of
workouts, meals, water and weights up to today, and a 40-day streak. Run it on the day you take
the screenshots, as the history ends on the day it runs. The data follows the weekdays, so it
differs from one run date to another: the screenshots here were taken on a Saturday, a rest day.
On a training day, today's workout is logged in the morning; run the seed after about 8:00 UTC. It needs the stack and
the Edge Functions running, and gives the account an AI budget so that Bite answers; Bite also
needs `GEMINI_API_KEY` (see [Development](../development.md)).

## Taking the screenshots

1. Start Metro without the developer tools, so that no developer buttons show:
   `pnpm start --no-dev --minify`. In Expo Go's menu, turn off the tools button.
2. Log in as the demo account in the simulator (Settings → Log in). After running the seed again,
   log out first: the old session belongs to the deleted account.
3. Take each screen with `xcrun simctl io booted screenshot <file>.png`, then shrink it to
   1200 px high: `sips -Z 1200 <file>.png`.
4. For `bite.png`, ask Bite "Just had 3 eggs, two slices of toast and a coffee with milk for
   lunch. Can you log it?". For `workout-active.png`, start Upper body and tick the first set;
   discard the workout afterwards.

## Recording the onboarding

With [idb](https://fbidb.io), [ffmpeg](https://ffmpeg.org) and [gifski](https://gif.ski)
installed, and the app on the welcome screen as a new guest:

```bash
scripts/record-onboarding.sh onboarding.mov
mkdir frames
ffmpeg -ss 2 -i onboarding.mov -vf "setpts=PTS/2.5,fps=12,scale=300:-1:flags=lanczos" frames/f%04d.png
gifski --fps 12 --width 300 --quality 80 -o docs/media/onboarding.gif frames/f*.png
```

The GIF plays at 2.5 times the real speed.
