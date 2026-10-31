#!/usr/bin/env bash
# Records the onboarding on the booted iOS Simulator, from the welcome screen to the finished plan,
# for the README's GIF (docs/media/README.md). Start it with the app on the welcome screen:
#
#   scripts/record-onboarding.sh [output.mov]
set -euo pipefail

OUT=${1:-onboarding.mov}
# shellcheck source=lib/simulator.sh
source "$(dirname "$0")/lib/simulator.sh"

next() { sleep "${1:-1.4}"; tap_label "Continue"; }

start_recording "$OUT"

tap_label "Get started for free"; sleep 1.6
type_text "Kaan"; next 1.2                          # name
sleep 1.2; tap 201 222; next 1.6                    # lose fat
next 2.2                                            # how it works
sleep 1.4; tap 201 582; next 1.0                    # consent
sleep 1.2; tap 292 298; next 1.0                    # male
next 1.6                                            # birth year
sleep 1.2; swipe 185 600 185 368; swipe 185 600 185 368; next 0.6   # 192 cm
sleep 1.2; swipe 141 620 141 390; swipe 141 620 141 390; swipe 141 620 141 390
swipe 141 440 141 490; next 0.6                     # 100 kg
sleep 1.2; swipe 141 380 141 545; next 0.6          # target 90 kg
next 2.0                                            # pace
sleep 1.2; tap 201 304; next 1.0                    # mostly sitting
next 1.8                                            # halfway
sleep 1.2; tap 201 371; next 1.0                    # intermediate
next 1.8                                            # days
sleep 1.2; tap 201 248; next 1.0                    # gym
sleep 1.2; tap 244 303; next 1.6                    # 60 minutes
sleep 7; tap_label "See my plan"
sleep 2.5; swipe 201 700 201 200 0.8; sleep 1.5; tap_label "Start my plan"
sleep 2; tap_label "Not now"                        # reminders
sleep 3.5

stop_recording
echo "Recorded $OUT"
