# 0118. Finish the workout on the watch

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

A workout followed by the watch could be finished only on the phone, whose finish screen saves it or discards it. The approved watch design finishes it from the end of the exercise list, with a question that says how many sets are done. The phone keeps the workout and saves it as a log (`log_workout`); the watch saves its own workout to the health store once the phone says the log is saved (ADR 0113).

## Decision

- **The watch asks, then sends a `finish` command.** "Finish workout" at the end of the list asks "Finish workout?" with the sets done, and Finish sends the command. Without a set done, Finish is off, as the phone saves no workout without one. The phone sends how many sets a finish saves, by the rule its own save follows, so the set its clock times counts; the watch adds the sets ticked there that the phone has not taken yet, as the phone takes them before the finish. Keep going goes back.
- **The phone saves the workout at once, as its own Save does, without its finish screen.** The app takes the command when it runs, keeps it in the workout, and saves the log through the same function as its Save and a workout left open, ending at the time of the finish: no earlier than the last set, as one ticked on the phone after the finish is still in it, and within the longest a workout can be. A clock still running logs its set; one started after the finish, as when the watch's clock runs behind, ends the workout when the phone takes it. Kept in the workout, a finish the app was ended on before saving it is saved when the app runs again, so the watch does not wait for it forever. A workout saved from two places at once, as from the watch and with the phone's Save, is saved once, and ends at the time of the first. What the watch measured follows through the catch-up, as for any workout the watch followed. The workout then ends as saved, which the watch hears with the phone's next state, and the workout's screens on the phone close.
- **A finish the phone cannot save is applied without ending the workout.** The command's id then shows among the commands the phone applied while the workout goes on, from which the watch tells that the save failed: it says so on the question, to try again there or to finish on the phone. The phone shows nothing more than its workout still running.
- **The watch waits while the phone saves.** It says "Saving on your iPhone", with a hint to open Benchbite there: the phone's app runs the save only while it runs, which the watch cannot tell, as with the phone locked; the command waits on the phone's side meanwhile, and the workout is saved when the app next runs.

## Alternatives considered

- **The phone opens its finish screen for a finish from the watch:** the user would need the phone after all, and the screen would wait there while the phone is locked.
- **The watch saves the log itself:** the watch has no account session nor network of its own to rely on, and the phone keeps the workout (ADR 0109).
- **A failed save ends the workout anyway and is retried later:** there is no queue of logs to save yet (#6); until there is, the workout stays in progress, where nothing is lost.

## Consequences

- A workout can be finished from the wrist; with the phone's app running, it is saved within a moment.
- With the phone locked and its app not running, the workout is saved only once the app runs again, until then the watch waits.
- A set ticked on the phone in the moment the save runs is not in the log: the log is the workout as it was when the finish arrived, and `log_workout` keeps the first log of a workout however often it is sent, so keeping the workout open for it would only lose it later.
- No end time is chosen on the watch: a workout left open is finished on the phone, whose finish screen offers it.
