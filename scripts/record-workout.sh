#!/usr/bin/env bash
# Records making a workout on the booted iOS Simulator, for the README's GIF
# (docs/media/README.md): a name and days, three exercises found in the library, the sets of one,
# and saving it. Start it with the app on the Workouts tab, after the onboarding:
#
#   scripts/record-workout.sh [output.mov]
set -euo pipefail

OUT=${1:-workout.mov}
# shellcheck source=lib/simulator.sh
source "$(dirname "$0")/lib/simulator.sh"

# Searches the library, picks the exercise with this name and clears the search.
pick() {
  type_text "$1"; sleep 1.4
  tap_label "$2"; sleep 1
  erase 20
}

start_recording "$OUT"

tap_label "New workout"; sleep 1.6
tap 201 174; sleep 0.6; type_text "Push day"; sleep 0.8
tap 300 234; sleep 0.6                              # close the keyboard
tap 150 272; sleep 0.5; tap 303 272; sleep 1        # Wednesday and Saturday
tap_label "Add exercises"; sleep 1.6
tap 215 138; sleep 0.6
pick "bench press" "Barbell Bench Press - Medium Grip"
pick "shoulder press" "Barbell Shoulder Press"
pick "pushdown" "Triceps Pushdown"
tap 350 779; sleep 1                                # close the keyboard
tap_label "Add 3 exercises"; sleep 1.8
tap 219 427; sleep 1.4                              # the bench press
tap_label "More: Sets"; sleep 0.6
tap_label "Less: Reps from"; sleep 0.4; tap_label "Less: Reps from"; sleep 0.6
tap_label "Less: Reps to"; sleep 0.4; tap_label "Less: Reps to"; sleep 0.6
tap_label "More: Rest"; sleep 0.4; tap_label "More: Rest"; sleep 1
tap_label "Done"; sleep 1.4
tap_label "Save"; sleep 3

stop_recording
echo "Recorded $OUT"
