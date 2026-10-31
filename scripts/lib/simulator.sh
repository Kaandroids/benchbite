# Helpers for the scripts that record the app on the booted iOS Simulator for the README
# (docs/media/README.md). They tap with idb (https://fbidb.io); coordinates are points on an
# iPhone 17 Pro, and `idb ui describe-all` shows them on another simulator.

UDID=$(xcrun simctl list devices booted -j | python3 -c '
import json, sys
booted = [d for ds in json.load(sys.stdin)["devices"].values() for d in ds]
if not booted: sys.exit("No booted simulator.")
print(booted[0]["udid"])')

tap() { idb ui tap --udid "$UDID" "$1" "$2"; }
swipe() { idb ui swipe --udid "$UDID" "$1" "$2" "$3" "$4" --duration "${5:-1.2}"; sleep 1; }
type_text() { idb ui text --udid "$UDID" "$1"; }
# Presses backspace this many times.
erase() { idb ui key-sequence --udid "$UDID" $(printf '42 %.0s' $(seq "$1")); }
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

# Records the screen to $1 until the script ends, also when a step fails. The screen's rounded
# corners are left out (--mask=ignored); the status bar is cropped when the GIF is made.
start_recording() {
  xcrun simctl io "$UDID" recordVideo --codec=h264 --mask=ignored --force "$1" &
  RECORDER=$!
  trap stop_recording EXIT
  sleep 2.5
}
stop_recording() { kill -INT "$RECORDER" 2>/dev/null && wait "$RECORDER" 2>/dev/null || true; }
