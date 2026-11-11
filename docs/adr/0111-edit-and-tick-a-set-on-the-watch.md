# 0111. Edit and tick a set on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The approved watch design (#470) shows the set to do next with its weight and reps, changes them with the Digital Crown, ticks the set with Done and runs the rest between sets with a ring and −15, Skip and +15. ADR 0109 has the phone keep the workout and the watch send commands; ADR 0110 added the watch app. The watch needs a few more facts from the phone to draw these screens, and a way to send a changed set and a changed rest.

## Decision

- **The phone says what the screens show,** so that the watch judges nothing on its own. Each exercise in the state carries its fields, whether its weight is added to the body (and so optional), and the step the Crown turns its weight by. Each set carries last time's set of the same number, described as the phone describes a set.
- **The weight's step follows the equipment:** 2 kg for dumbbells, 4 kg for kettlebells, and 2.5 kg, 1.25 kg a side, for anything else. The reps turn by one.
- **Values changed on the watch go with the set's tick.** The Crown changes a draft that stays on the watch; Done sends `setDone` with the values the watch showed, which the phone sets before it ticks the set, each value by the rule of ADR 0109 that the latest change wins. A value is never turned to none unless the exercise can be done without it, so a set with a draft has what it needs.
- **The rest shows the watch's change at once.** −15, Skip and +15 send `setRest` for the rest the watch showed, and the watch counts to the new end until the phone's state includes it. A rest the watch changes counts as changed then on the phone, so a tick made earlier on the watch and arriving later starts no rest again.
- **Only lifted sets are edited on the watch.** A set measured by time is still finished on the phone, whose clock measures it, until the watch runs its own.
- The texts are in English and the font is the system's rounded one, close to Nunito; the texts in the user's language follow in their own pull request.

## Alternatives considered

- **Sending each Crown change as `setValues` at once:** the phone would show the values sooner, but a `setValues` and a `setDone` can arrive in either order when one goes as a message and the other as a transfer, and a tick that arrives first is refused for a missing weight. One command for the tick and its values cannot be split.
- **Working out on the watch what a set needs, or the step of a weight:** it would repeat in Swift what the phone already knows, and the two could drift apart.
- **A step chosen by the user per exercise:** more to set up for a gain few would use; it can come later on the phone and be sent the same way.

## Consequences

- The protocol stays at version 1: no watch app with the earlier messages has been released, and a `setDone` without values is read as before.
- The watch keeps drafts only while it shows the set; a draft not ticked is gone once the set is ticked on the phone.
- The Crown's turns cannot be tested without a watch or the simulator's Crown, so the editor is checked by hand.
