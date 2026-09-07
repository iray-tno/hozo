#!/usr/bin/env bash
# Install the release APK on a running emulator, launch it, and fail if it
# did not come up.
#
# The first thing in this repository to execute Hozo's Native output on a
# React Native runtime. Everything else renders it against
# `packages/tailwind-conformance/src/react-native-stub.js`, whose own header
# says what that is worth: it does not prove React Native accepts the
# output, only that Hozo agrees with itself.
#
# A *release* build, so there is no Metro server and no red box. An error
# that would have been a red box in development is a process that dies,
# which is exactly the signal wanted here.
#
# Two assertions, and the second is the one that matters:
#
#   1. the process is still alive a few seconds after launch -- a crash on
#      first render takes a moment, so checking immediately after `am start`
#      would pass for an app that is already on its way down;
#   2. the accessibility tree contains a `testID` the app renders. Without
#      it a process that started and drew nothing would pass, which is the
#      shape most of these failures actually take.
#
# The second assertion is also the seed of the rest of #297: reading the
# tree at all is the mechanism the accessibility contract will be checked
# with.
#
# Run it against a local emulator with the same arguments CI uses.

set -euo pipefail

package=com.hozonativedemo
activity="${package}/.MainActivity"
apk="$(dirname "$0")/../android/app/build/outputs/apk/release/app-release.apk"
# A testID from `App.tsx`. The list is the outermost thing on the screen, so
# it is present whatever else failed to lay out.
expect_id=smoke-list

fail() {
  echo "::error::$*"
  echo '--- logcat ---'
  adb logcat -d -v brief | tail -200 || true
  exit 1
}

[ -f "$apk" ] || fail "no release APK at $apk -- did assembleRelease run?"

echo "installing $apk"
adb install -r "$apk"

adb logcat -c
echo "launching $activity"
adb shell am start -W -n "$activity"

# Up to thirty seconds to appear, then five more to fall over. The first
# window is generous because a cold start on an emulator under CI load is
# nothing like a device.
for _ in $(seq 1 30); do
  if [ -n "$(adb shell pidof "$package" | tr -d '\r')" ]; then break; fi
  sleep 1
done
pid="$(adb shell pidof "$package" | tr -d '\r')"
[ -n "$pid" ] || fail "$package never started"
echo "started as pid $pid"

sleep 5
still="$(adb shell pidof "$package" | tr -d '\r')"
[ -n "$still" ] || fail "$package started and then died"

# `FATAL EXCEPTION` covers a Java-side crash that took the process with it;
# the process check above would catch that too, but the message is the
# useful part and logcat is cleared by then if we wait for the artifact.
if adb logcat -d | grep -q 'FATAL EXCEPTION'; then
  fail "$package logged a fatal exception"
fi

echo "reading the accessibility tree"
adb shell uiautomator dump /sdcard/window_dump.xml >/dev/null
adb pull /sdcard/window_dump.xml ./window_dump.xml >/dev/null
if ! grep -q "$expect_id" window_dump.xml; then
  echo '--- accessibility tree ---'
  cat window_dump.xml
  fail "the tree has no $expect_id in it, so the app started and rendered nothing recognisable"
fi

echo "ok: $package is up and its tree contains $expect_id"
