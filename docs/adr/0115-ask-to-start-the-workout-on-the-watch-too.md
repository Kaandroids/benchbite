# 0115. Ask to start the workout on the watch too

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

ADR 0109 has a workout start on the phone and the watch follow it once the user joins it there. Joining means opening Benchbite on the watch and pressing Join each time, while most workouts with the watch on the wrist are meant to be followed from the start. A workout the watch follows has its rests signalled only on the watch (ADR 0114), so the user should know when that is the case.

## Decision

- **Starting a workout asks whether it starts on the watch too**, when a watch is paired and Benchbite is on it: "Start on watch too" or "Only on this phone", with "Don't ask again". The sheet says that sets show on both and that rest alerts then come only from the watch. Closing it, or leaving it open as the app signs out, starts on the phone alone. It comes after the question of which day the workout counts for (ADR 0028), once the workout is sure to start.
- **The settings keep the choice:** Ask, Always or Never, under Watch, which shows only with such a watch. "Don't ask again" sets Always or Never. The choice belongs to the device, as the watch does.
- **A workout started on the watch too is followed from the start**, as if the watch had joined it: the phone sends it with `follows`, and the watch starts its workout session (ADR 0113) when that state arrives.
- **The phone opens Benchbite on the watch** with HealthKit's `startWatchApp(with:)`, which launches the watch app for a strength training workout. The app then asks to signal rests, as joining does. Until the user allows it, the watch does not say it signals a rest, so the phone keeps its own notification (ADR 0114).

## Alternatives considered

- **Always starting on the watch when one is there:** a workout done without the watch on the wrist would leave its rests to a watch that cannot tap anyone, until the phone takes them back 75 seconds late.
- **Only joining on the watch, as before:** the user would open the app and press Join at every workout, and the first sets would pass without the heart rate.
- **Mirroring the watch's workout session to the phone (iOS 17):** it shares a session the watch runs with the phone, which still has to open the watch app first, and adds a session on the phone that nothing here needs.

## Consequences

- With the choice Always, a workout started on the phone opens Benchbite on the watch, which measures the heart rate and signals the rests from the first set.
- A watch out of reach when the workout starts does not open the app. Opened later, it follows the workout without a Join, as the phone says it does; until it measures, the phone signals the rests.
- Joining on the watch stays for a workout started only on the phone.
