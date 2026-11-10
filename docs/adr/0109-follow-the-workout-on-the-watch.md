# 0109. Follow the workout in progress on the watch

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Users want to log the workout in progress from their wrist (#470, later #471 on Wear OS): see the set, change the weight and reps, tick it and rest, with the phone in a pocket or across the room. The workout in progress lives on the phone (ADR 0020), which saves it when it is finished.

The phone and the watch can each change the workout, often in turn: a set on the watch, the next on the phone, then the watch again. Messages between them can arrive late, twice or after the other side changed the same set. While the phone app is in the background or closed, its JavaScript does not run.

The rest alert must come from one device only. A notification on the phone and a tap from the watch app would alert twice for the same rest. When the iPhone is locked, iOS also forwards the phone's notification to the watch.

## Decision

- **The phone keeps the workout; the watch shows it and sends commands.** The phone sends the watch its state:
  - the exercises, named in the user's language;
  - their sets;
  - last time's sets;
  - the rest's end time;
  - the ids of the commands it applied.

  Each state has a growing `seq`, so the watch drops an older one.

- **Commands say what should be, never what to toggle.** A command sets a set's values, sets it done or not done, adds a set, or changes or skips the rest the watch showed. It carries:
  - a unique `id`, so it applies once however often it arrives;
  - the time the user acted on the watch (`at`);
  - the workout's id, so a command for another workout is dropped.

  The phone applies a command with the same functions its own screen uses.

- **On each set, the latest change wins.** The workout keeps, for each set, when its values last changed and when it was last ticked or unticked, on either device. A command older than the set's last change of the same kind changes nothing. It still counts as applied, so the watch stops waiting on it. A command's time is at most the time it arrives.
- **The rest is an end time,** not seconds left, so both devices show the same second. A tick that arrives late starts no rest that is already over, and leaves the rest of a later set.
- **One interface, one implementation per platform.** `src/watch/types.ts` defines `WatchLink`: the watch's status, sending the state, and receiving commands. `link.ios.ts` implements it over WatchConnectivity, and later `link.android.ts` over the Wearable Data Layer. `link.ts` is the version without a watch. Native code only carries JSON. What the messages mean is decided once, in TypeScript, in `src/watch/protocol.ts`, which the watch apps follow.
  - On iOS, the state goes by application context, whose latest wins and which arrives in the background, and by message when the watch is reachable.
  - Commands go by message when the watch is reachable, else by user info transfer, which waits and arrives in order.
  - The native module keeps commands that arrive while the app's JavaScript is not running, until it reads them.
- **Asked at the start, the alert on one device.** When a watch is found (paired, with Benchbite, reachable), starting a workout asks whether to start it on the watch too. A setting can keep the answer.
  - While the watch follows the workout, only the watch alerts when a rest is over, and the phone schedules no rest notification.
  - A command from the watch removes a rest notification the phone scheduled before.
  - When the watch stops talking for a while, the phone takes the alerts back.
  - Without a watch, everything stays on the phone as before.
- **Heart rate and calories do not go through this link.** The watch's workout session writes them to Apple Health, where the phone already reads them (ADR 0097).

This first step adds the protocol, the interface without a watch, and the component that keeps the two in step. The iOS module, the watch app and the phone's screens follow, as the approved mock-up shows them.

## Alternatives considered

- **Toggle commands, as the phone's own tick is.** A toggle delivered twice, or after the phone ticked the same set, undoes it.
- **Sending the whole workout both ways, the newer one winning.** A change on one device would undo a change made meanwhile on the other, even on another set.
- **A server between the two, through Supabase.** It needs a connection in the gym, adds a round trip to every tick, and puts the workout in progress on the server, which keeps only finished workouts (ADR 0020).
- **Each platform with its own logic in Swift and Kotlin.** The rules for applying commands would be written and tested three times.
- **Alerts on both devices.** The same rest would alert twice.

## Consequences

- The workout in progress keeps two times on each set and the ids of the latest 50 commands applied. A workout started before keeps working: missing times count as never.
- Each change of the workout, such as each digit typed, sends a new state. Sending replaces what was not delivered, so this stays cheap.
- The watch apps follow `src/watch/protocol.ts`. A change to the messages raises `PROTOCOL_VERSION`, and each side drops messages of another version.
- Changes are ordered by the devices' clocks, which a paired watch keeps close to the phone's. A watch whose clock runs behind can lose a change against an older one made on the phone; one whose clock runs ahead cannot win over later ones, as a command's time is at most the time it arrives.
- A command applies only what the phone itself allows: values rounded as when typed, a set ticked only with what it needs, a set whose clock runs ticked with the clock's time.
- The watch can only follow a workout started on the phone. Starting one on the watch, or doing one without the phone, is #472.
