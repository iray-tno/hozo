#!/usr/bin/env bash
# Install the release APK on a running emulator, launch it, drive it, and
# fail if any of that did not work.
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
# What it establishes:
#
#   1. the process is still alive a few seconds after launch -- a crash on
#      first render takes a moment, so checking immediately after `am start`
#      would pass for an app that is already on its way down;
#   2. the accessibility tree contains a `testID` the app renders. Without
#      it a process that started and drew nothing would pass, which is the
#      shape most of these failures take;
#   3. pressing Continue opens the dialog and the tree says so, and Back
#      closes it again. The last of the five checks under "Screen-reader
#      pass" in `VALIDATION.md` needed an interaction rather than a new
#      mechanism, and `bounds` in the dump is the whole mechanism.
#
# The dumps are the point as much as the assertions. Each is saved, and
# `packages/tailwind-conformance/src/native-tree.ts` reads them offline
# against what the compiler emitted for the same source.
#
# No Maestro, deliberately. Driving one platform through `adb` needs no
# dependency and works today; Maestro earns its place when iOS arrives and
# the alternative is writing all of this again in XCUITest.
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

# Pulls the current tree to a named file and leaves it in the working
# directory, where the workflow collects it.
dump() {
  adb shell uiautomator dump /sdcard/dump.xml >/dev/null
  adb pull /sdcard/dump.xml "./$1" >/dev/null
}

# The centre of an element, read out of its `bounds`, which uiautomator
# reports as `[left,top][right,bottom]`. This is why driving Android needs
# nothing installed: the dump already says where everything is.
# node rather than python, because this repository already requires node
# everywhere and requires python nowhere.
centre_of() {
  node --eval '
    const [file, wanted] = process.argv.slice(1)
    const xml = require("node:fs").readFileSync(file, "utf8")
    for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
      if (!node[0].includes(`resource-id="${wanted}"`)) continue
      const box = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node[0])
      if (!box) continue
      const [left, top, right, bottom] = box.slice(1).map(Number)
      console.log((left + right) >> 1, (top + bottom) >> 1)
      process.exit(0)
    }
    process.exit(1)
  ' "$1" "$2"
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
# useful part.
if adb logcat -d | grep -q 'FATAL EXCEPTION'; then
  fail "$package logged a fatal exception"
fi

echo "reading the accessibility tree"
dump window_dump.xml
if ! grep -q "$expect_id" window_dump.xml; then
  echo '--- accessibility tree ---'
  cat window_dump.xml
  fail "the tree has no $expect_id in it, so the app started and rendered nothing recognisable"
fi

# --- the dialog round trip -------------------------------------------------

if ! read -r tap_x tap_y < <(centre_of window_dump.xml smoke-interaction); then
  fail "smoke-interaction has no bounds in the tree, so there is nothing to press"
fi
echo "pressing Continue at ${tap_x},${tap_y}"
adb shell input tap "$tap_x" "$tap_y"
sleep 2

dump dialog_dump.xml
if ! grep -q 'smoke-dialog' dialog_dump.xml; then
  echo '--- tree after pressing Continue ---'
  cat dialog_dump.xml
  fail "pressing Continue did not open the dialog"
fi
echo "the dialog is open"

echo "dismissing with Back"
adb shell input keyevent 4
sleep 2
dump dismissed_dump.xml
if grep -q 'smoke-dialog' dismissed_dump.xml; then
  echo '--- tree after Back ---'
  cat dismissed_dump.xml
  fail "Back did not dismiss the dialog"
fi

# Reported rather than asserted, for now. `VALIDATION.md` also asks that
# dismissing returns focus to Continue, and whether React Native restores
# it on this platform is a question nothing here has ever been able to ask.
# The answer belongs in the log of the first run that produces one, not in
# an assertion written before seeing it.
echo "focused after dismissal:"
grep -o 'resource-id="[^"]*"[^>]*focused="true"' dismissed_dump.xml || echo '  (nothing reports focus)'

echo "ok: $package is up, its tree contains $expect_id, and the dialog opens and closes"
