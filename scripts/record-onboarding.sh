#!/usr/bin/env bash
# Records the onboarding on the booted iOS Simulator, from the welcome screen to the finished plan,
# for the README's GIF (docs/media/README.md). Start it with the app on the welcome screen:
#
#   scripts/record-onboarding.sh [output.mov]
#
# It taps with idb (https://fbidb.io). The coordinates are points on an iPhone 17 Pro; on another
# simulator, check them with `idb ui describe-all`.
set -euo pipefail

OUT=${1:-onboarding.mov}
UDID=$(xcrun simctl list devices booted -j | python3 -c '
import json, sys
booted = [d for ds in json.load(sys.stdin)["devices"].values() for d in ds]
if not booted: sys.exit("No booted simulator.")
print(booted[0]["udid"])')

tap() { idb ui tap --udid "$UDID" "$1" "$2"; }
swipe() { idb ui swipe --udid "$UDID" "$1" "$2" "$3" "$4" --duration "${5:-1.2}"; sleep 1; }
# Taps the element with this accessibility label.
tap_label() {
  local point
  point=$(idb ui describe-all --udid "$UDID" | python3 -c '
import json, sys
for e in json.load(sys.stdin):
    if e.get("AXLabel") == sys.argv[1]:
        f = e["frame"]
        print(round(f["x"] + f["width"] / 2), round(f["y"] + f["height"] / 2))
        break
else:
    sys.exit("Not on screen: " + sys.argv[1])' "$1")
  # shellcheck disable=SC2086 # the point is two words
  tap $point
}
next() { sleep "${1:-1.4}"; tap_label "Continue"; }

xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$OUT" &
RECORDER=$!
sleep 2.5

tap_label "Get started for free"; sleep 1.6
idb ui text --udid "$UDID" "Kaan"; next 1.2         # name
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

kill -INT "$RECORDER"
wait "$RECORDER" 2>/dev/null || true
echo "Recorded $OUT"
