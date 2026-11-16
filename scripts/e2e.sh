#!/usr/bin/env bash
# Runs the Maestro flows in .maestro on an iOS Simulator of their own, against the local Supabase
# stack, the Edge Functions and Metro on this Mac (docs/development.md, "End-to-end tests"):
#
#   pnpm e2e                          # every flow
#   pnpm e2e .maestro/onboarding.yaml # one flow
#
# The flows start the app from scratch, so they run on a simulator named "Benchbite E2E" rather
# than the one used day to day. It is made the first time, with the development build copied from
# another simulator; delete it with `xcrun simctl delete "Benchbite E2E"` to take a new build.
set -euo pipefail

DEVICE="Benchbite E2E"
APP_ID=com.benchbite.app.dev
cd "$(dirname "$0")/.."

fail() {
  echo "$1" >&2
  exit 1
}

command -v maestro >/dev/null || fail "Maestro is not installed: see docs/development.md."
curl -s -o /dev/null http://127.0.0.1:54321/rest/v1/ ||
  fail "The local Supabase stack is not running: pnpm supabase start."
# A function that is not served answers 404 or a 5xx; one that is asks for a token first.
status=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS \
  http://127.0.0.1:54321/functions/v1/generate-plan)
[[ $status == 404 || $status == 5* ]] &&
  fail "The Edge Functions are not served: pnpm supabase functions serve."
[[ $(curl -s http://127.0.0.1:8081/status) == packager-status:running ]] ||
  fail "Metro is not running on port 8081: pnpm start."

udid=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
for devices in json.load(sys.stdin)["devices"].values():
    for device in devices:
        if device["name"] == sys.argv[1]:
            print(device["udid"])
            sys.exit()' "$DEVICE")
if [[ -z $udid ]]; then
  runtime=$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
print([r for r in json.load(sys.stdin)["runtimes"] if r["platform"] == "iOS" and r["isAvailable"]][-1]["identifier"])')
  udid=$(xcrun simctl create "$DEVICE" "iPhone 17 Pro" "$runtime")
  echo "Made the simulator $DEVICE."
fi
xcrun simctl bootstatus "$udid" -b >/dev/null

if ! xcrun simctl get_app_container "$udid" "$APP_ID" >/dev/null 2>&1; then
  # The development build of another simulator, such as the one `pnpm ios` installed it on.
  app=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
for devices in json.load(sys.stdin)["devices"].values():
    for device in devices:
        if device["udid"] != sys.argv[1] and device["state"] == "Booted":
            print(device["udid"])' "$udid" | while read -r other; do
    xcrun simctl get_app_container "$other" "$APP_ID" 2>/dev/null && break
  done || true)
  [[ -n $app ]] || fail "No booted simulator has the development build: pnpm ios, then try again."
  xcrun simctl install "$udid" "$app"
  echo "Installed the development build on $DEVICE."
fi

maestro --device "$udid" test "${@:-.maestro}"
