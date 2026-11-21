#!/usr/bin/env bash
# Builds Benchbite itself, against the hosted project, and installs it on a connected iPhone
# (docs/deployment.md, "A release build on an iPhone"; ADR 0161):
#
#   pnpm build:ios:release                  # the one iPhone that is connected
#   pnpm build:ios:release --device <udid>  # that iPhone, when more than one is
#   pnpm build:ios:release --no-install     # only build
#
# It generates ios/ anew for the release, so run `pnpm native:dev` before the next development
# build. Each step that went wrong by hand is checked here: the environment file of the hosted
# project, the signing team, the Sentry token, the iPhone, and which server the built app names.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=.env.production.local
SCHEME=Benchbite
APP=ios/build/Build/Products/Release-iphoneos/$SCHEME.app

fail() {
  echo "$1" >&2
  exit 1
}

# The value of a variable in an environment file, without reading the rest of the file into the
# shell: the development file's addresses would take the hosted project's place.
value_in() {
  [[ -f $1 ]] || return 0
  grep -E "^$2=" "$1" | tail -n 1 | cut -d= -f2- || true
}

device=""
install=true
while (($#)); do
  case $1 in
    --device)
      device=${2:-}
      [[ -n $device ]] || fail "--device needs the iPhone's UDID: xcrun devicectl list devices."
      shift 2
      ;;
    --no-install)
      install=false
      shift
      ;;
    *) fail "Unknown option $1. Usage: pnpm build:ios:release [--device <udid>] [--no-install]" ;;
  esac
done

# The hosted project, which the app is built against.
url=$(value_in "$ENV_FILE" EXPO_PUBLIC_SUPABASE_URL)
[[ -n $url ]] ||
  fail "$ENV_FILE is missing or names no EXPO_PUBLIC_SUPABASE_URL: see docs/deployment.md."
host=${url#*://}
host=${host%%[:/]*}
[[ $host != 127.0.0.1 && $host != localhost && ! $host =~ ^(10|192\.168)\. ]] ||
  fail "$ENV_FILE names $host, a local address: a release build goes against the hosted project."
[[ -n $(value_in "$ENV_FILE" EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ]] ||
  fail "$ENV_FILE names no EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY."

# The iPhone, before the minutes of building: a real one that can be reached, and only one.
if $install && [[ -z $device ]]; then
  devices=$(mktemp)
  xcrun devicectl list devices --json-output "$devices" >/dev/null
  connected=$(
    node -e '
      const { devices } = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).result;
      for (const { hardwareProperties: hardware, connectionProperties: connection, deviceProperties } of devices) {
        const reachable = connection?.pairingState === "paired" && connection?.tunnelState !== "unavailable";
        if (hardware?.deviceType === "iPhone" && hardware?.reality === "physical" && reachable) {
          console.log(`${hardware.udid}\t${deviceProperties?.name}`);
        }
      }
    ' "$devices"
  )
  rm -f "$devices"
  [[ -n $connected ]] ||
    fail "No iPhone is connected. Connect one, or build without installing: --no-install."
  (($(wc -l <<<"$connected") == 1)) ||
    fail "More than one iPhone is connected: name one with --device <udid>.
$connected"
  device=${connected%%$'\t'*}
  echo "Installing on ${connected#*$'\t'}."
fi

team=$(node -p 'require("./app.json").expo.ios.appleTeamId ?? ""')
[[ -n $team ]] || fail "app.json names no ios.appleTeamId to sign the app with."

# Sentry's build step uploads source maps and debug symbols, and stops the build without a token.
SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN:-$(value_in .env.local SENTRY_AUTH_TOKEN)}
if [[ -n $SENTRY_AUTH_TOKEN ]]; then
  export SENTRY_AUTH_TOKEN
else
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  echo "No SENTRY_AUTH_TOKEN in .env.local: Sentry will not be able to read this build's stack traces."
fi

export APP_VARIANT=production NODE_ENV=production

echo "Generating ios/ for the release…"
pnpm expo prebuild --clean --platform ios >/dev/null

# With a device, Xcode builds for that iPhone; without one, for any.
destination=generic/platform=iOS
[[ -z $device ]] || destination=id=$device

echo "Building, which takes some minutes…"
log=$(mktemp)
if ! (
  cd ios && xcodebuild -workspace "$SCHEME.xcworkspace" -scheme "$SCHEME" -configuration Release \
    -destination "$destination" -derivedDataPath build -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$team" CODE_SIGN_STYLE=Automatic build
) >"$log" 2>&1; then
  grep -E "error:|BUILD FAILED" "$log" | head -n 20 >&2 || true
  fail "The build failed; its whole output is in $log."
fi
rm -f "$log"

# The app reads its server from the environment at build time: one built from the wrong file
# would open and say it cannot connect. The bundle is read as it is, not through a pipe: a search
# that stops at its first match would end the pipe early, which `pipefail` takes for a failure.
grep -qaF -- "$host" "$APP/main.jsbundle" ||
  fail "The built app does not name $host: check which environment files the build read."

if $install; then
  echo "Installing…"
  xcrun devicectl device install app --device "$device" "$APP" >/dev/null ||
    fail "Could not install on the iPhone: unlock it and run this again with --device $device."
  bundle_id=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Info.plist")
  xcrun devicectl device process launch --device "$device" "$bundle_id" >/dev/null ||
    echo "Installed; open Benchbite on the iPhone, which could not be started from here."
fi

version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Info.plist")
echo "Built Benchbite $version against $host: $APP"
echo "ios/ is the release's now: run pnpm native:dev before the next development build."
