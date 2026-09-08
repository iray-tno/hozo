#!/usr/bin/env bash
# Install the release build on a simulator, launch it, and fail if the app
# did not come up and draw.
#
# The other half of #297. `android-smoke.sh` says why any of this exists:
# everything else in this repository renders Hozo's Native output against
# `packages/tailwind-conformance/src/react-native-stub.js`, which can only
# confirm that Hozo agrees with itself. This is the same sentence for the
# platform whose runtime is a different one -- different renderer,
# different text metrics, different accessibility API.
#
# What it establishes, and what it does not:
#
#   1. the app builds against the real iOS toolchain -- CocoaPods, the
#      React Native pods, Hermes, and the Xcode script phase that runs
#      Metro, which is where `@hozo/metro`'s transformer runs. A bundle
#      that Metro refuses fails here and nowhere else;
#   2. the process is alive some seconds after launch, because a throw on
#      first render takes a moment and an immediate check passes for an app
#      already on its way down;
#   3. React Native initialised, from the `NSLog` that
#      `RCTReactNativeFactory.mm` makes unconditionally while setting the
#      runtime up -- a line React Native writes, not one this repository
#      added to the app;
#   4. the screen is not one flat colour. This is the outcome check, and
#      the reason (3) is not enough on its own: (3) happens before any
#      JavaScript runs, so an app whose bundle throws logs it and shows a
#      blank window.
#
# What it does not do is read the accessibility tree, which is the thing
# the Android job is most valuable for. `uiautomator dump` has no
# equivalent here: the tree lives behind XCUITest or a third-party runner,
# and both are a bigger decision than this script. The census on iOS is a
# separate piece of work, and this one deliberately claims less rather than
# claiming it with a check that cannot fail.
#
# Run it locally on a Mac with the same environment CI uses.

set -euo pipefail

bundle_id=com.hozonativedemo
process_name=HozoNativeDemo
device_name="${IOS_DEVICE_NAME:-iPhone 16}"
here="$(cd "$(dirname "$0")" && pwd)"
app="${here}/../ios/build/Build/Products/Release-iphonesimulator/${process_name}.app"
log_file="${PWD}/ios-app.log"
screenshot="${PWD}/ios-screen.png"

fail() {
  echo "::error::$*"
  echo '--- the app log ---'
  tail -200 "$log_file" 2>/dev/null || echo '(no log was captured)'
  exit 1
}

[ -d "$app" ] || fail "no app at $app -- the xcodebuild step did not produce one"
# The baked bundle, which is what makes this a release run: no Metro server
# to fall back on, so a bundle that did not get built is a blank app rather
# than a connection error.
[ -s "${app}/main.jsbundle" ] || fail 'the app has no main.jsbundle: the Metro script phase produced nothing'

# The simulator, by name rather than by position in the list: the runner
# image decides which devices exist and the set changes with Xcode.
udid="$(xcrun simctl list devices available \
  | grep -E "^[[:space:]]+${device_name} \(" \
  | head -1 \
  | sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/')"
if [ -z "$udid" ]; then
  echo '--- the devices this runner has ---'
  xcrun simctl list devices available
  fail "no simulator named '${device_name}'"
fi
echo "using ${device_name} (${udid})"

xcrun simctl boot "$udid" || true
# Waits for the boot to finish rather than sleeping at it. Without this the
# install below races the springboard and fails with a device-not-booted
# error that reads like a broken build.
xcrun simctl bootstatus "$udid" -b

# The log stream starts before the launch, or the line that says the app
# started is already in the past by the time anything reads for it.
xcrun simctl spawn "$udid" log stream \
  --style compact \
  --predicate "process == \"${process_name}\"" > "$log_file" 2>&1 &
log_pid=$!
trap 'kill "$log_pid" 2>/dev/null || true' EXIT

xcrun simctl install "$udid" "$app"
xcrun simctl launch "$udid" "$bundle_id"

# React Native's own line, and a native one on purpose.
#
# The first version of this waited for `Running "HozoNativeDemo"`, which
# `AppRegistryImpl.js` logs with `console.log` -- and JavaScript's console
# does not reach the system log in a release build, so it never arrived.
# The app was fine: the same run's log has React Native starting, a
# `RCTScrollViewComponentView` on screen, and the acceptance screen's
# remote image being fetched. Sixty seconds of waiting for a line that
# cannot appear, and a failure that named the app rather than the check.
#
# `RCTReactNativeFactory.mm` logs this one with `NSLog`, unconditionally,
# while setting up the runtime. It says React Native initialised, which is
# less than the old line claimed -- the screenshot below is what says the
# app drew.
started=false
for _ in $(seq 1 60); do
  if grep -q '_setUpFeatureFlags called with release level' "$log_file"; then
    started=true
    break
  fi
  sleep 1
done

# Alive, and said so by the process list rather than by the absence of a
# crash line. `launchctl list` inside the simulator names running apps
# `UIKitApplication:<bundle id>`.
if ! xcrun simctl spawn "$udid" launchctl list 2>/dev/null | grep -q "UIKitApplication:${bundle_id}"; then
  fail "${bundle_id} is not running: it launched and then died"
fi

"$started" || fail 'React Native never initialised in 60s'

# The outcome, polled rather than slept at: a screen that is still one
# colour is either a screen that has not been drawn yet or one that never
# will be, and the only difference between them is how long you wait.
drew=false
for attempt in $(seq 1 30); do
  xcrun simctl io "$udid" screenshot "$screenshot" > /dev/null 2>&1 || true
  if [ -s "$screenshot" ] && node "${here}/screen-colours.mjs" "$screenshot" 8 > /dev/null 2>&1; then
    drew=true
    echo "the screen had something on it after ${attempt}s"
    break
  fi
  sleep 1
done

if ! "$drew"; then
  # Print what the count actually was, rather than only that it failed.
  node "${here}/screen-colours.mjs" "$screenshot" 8 || true
  fail 'the app initialised React Native and then drew nothing'
fi

echo 'the app booted, initialised React Native and drew'
