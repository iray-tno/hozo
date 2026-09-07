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
#
# Retried, because `uiautomator dump` refuses to run while the window is
# not idle and says so with "ERROR: could not get idle state" -- then exits
# 0 and writes nothing, so the failure arrives later as a missing file. It
# is transient: a shared runner under load takes longer to settle than
# uiautomator's own patience, and the first green run of this job simply
# got a quieter machine. Retrying is the mitigation; there is nothing to
# fix in the app.
dump() {
  local into="$1"
  for attempt in 1 2 3 4 5 6; do
    adb shell rm -f /sdcard/dump.xml >/dev/null 2>&1 || true
    # Judged by whether a file arrived, not by what the command said.
    #
    # This used to test the output for "UI hierarchy dumped", and that was
    # wrong twice over: `grep -q` swallowed the line, so neither the
    # success message nor the "could not get idle state" error reached the
    # log and every diagnosis after it was made blind -- and the message
    # itself is not a contract. AOSP has shipped it misspelled
    # ("hierchary"), so a working dump could fail the test and retry six
    # times over a file that was already there.
    adb shell uiautomator dump /sdcard/dump.xml 2>&1 | sed 's/^/    /' || true
    if adb pull /sdcard/dump.xml "./$into" >/dev/null 2>&1 && [ -s "./$into" ]; then
      return 0
    fi
    # What "not idle" means, printed rather than guessed at. The frame
    # count is the question: a window that never idles is one that is
    # still drawing, and the delta across a retry says whether something
    # is animating continuously or the app was merely slow to start.
    # Both, because uiautomator waits for the *device* to go quiet rather
    # than the app. A frozen app count next to a climbing system one says
    # the app is not the thing keeping the screen busy, and the first fix
    # here was aimed at the app.
    echo "  dump attempt $attempt did not settle; frames drawn so far:"
    for who in "$package" com.android.systemui; do
      printf '    %s: ' "$who"
      adb shell dumpsys gfxinfo "$who" 2>/dev/null \
        | grep -E 'Total frames rendered' | head -1 || echo '(none)'
    done
    sleep 5
  done
  echo "--- what has focus ---"
  adb shell dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | sed 's/^/  /' || true
  # A screenshot needs no idle window, so it is the one thing that still
  # works when the tree will not come. Offline profiling has ruled out a
  # React render loop and `HozoAnimated` (`acceptance-screen.test.ts`), so
  # what is left is something drawing natively -- and a picture of the
  # screen says whether the remote image resolved, whether a field has a
  # blinking caret, and whether anything is mid-transition.
  adb exec-out screencap -p > "./${into%.xml}-failed.png" 2>/dev/null || true
  fail "could not read the accessibility tree after six attempts"
}

# The centre of an element, read out of its `bounds`, which uiautomator
# reports as `[left,top][right,bottom]`. This is why driving Android needs
# nothing installed: the dump already says where everything is.
# node rather than python, because this repository already requires node
# everywhere and requires python nowhere.
#
# Refuses a target in the bottom eighth of the screen. A dump reports
# bounds for everything it can see, and the app does not own the bottom
# of the display: the gallery button was at y=2315 of 2400 the first time,
# inside the system gesture area, so tapping it went home instead of
# opening anything and the next dump was of the launcher. A press that
# lands on the navigation bar is not a press this can make, and saying so
# is better than reporting whatever the home screen happens to contain.
centre_of() {
  node --eval '
    const [file, wanted] = process.argv.slice(1)
    const xml = require("node:fs").readFileSync(file, "utf8")
    for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
      if (!node[0].includes(`resource-id="${wanted}"`)) continue
      const box = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node[0])
      if (!box) continue
      const [left, top, right, bottom] = box.slice(1).map(Number)
      const height = Number(/bounds="\[0,0\]\[\d+,(\d+)\]"/.exec(xml)?.[1] ?? 0)
      const y = (top + bottom) >> 1
      if (height && y > height * 0.875) {
        console.error(`${wanted} is at y=${y} of ${height}, inside the system gesture area`)
        process.exit(2)
      }
      console.log((left + right) >> 1, y)
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

# Long enough for a crash on first render to have happened, and long enough
# for the screen to stop drawing. The second is what `uiautomator dump`
# needs: it waits for an idle window and gives up on its own schedule, and
# this screen fetches a remote image, measures a grid, and settles a
# transition before it is done.
sleep 12
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
# The app first, and this order matters. Asserting only that the dialog is
# gone tests an absence, and an absence is also what leaving the app looks
# like: if Back is not consumed by the modal it pops the activity, the tree
# becomes the launcher's, and `smoke-dialog` is missing from it for the
# wrong reason. The previous run reported "ok" on exactly that, because
# nothing after it ever looked.
if ! grep -q "$expect_id" dismissed_dump.xml; then
  echo '--- tree after Back ---'
  cat dismissed_dump.xml
  fail "Back left the app instead of dismissing the dialog"
fi
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

# --- the census screen -----------------------------------------------------

# `Gallery.tsx` renders every primitive at once, which is what the
# accessibility contract in #260 is about -- the acceptance screen above is
# eight of them arranged the way an application would. Reached by pressing a
# button rather than by a second activity, because the tap machinery is
# already here and an activity would be a second thing to keep working.

if ! read -r tap_x tap_y < <(centre_of dismissed_dump.xml smoke-gallery); then
  fail "smoke-gallery has no bounds in the tree, so the census screen is unreachable"
fi
echo "opening the gallery at ${tap_x},${tap_y}"
adb shell input tap "$tap_x" "$tap_y"
sleep 2

dump gallery_dump.xml
if ! grep -q "gallery-Heading" gallery_dump.xml; then
  echo '--- tree after opening the gallery ---'
  cat gallery_dump.xml
  fail "the gallery did not open"
fi

# A picture as well as a tree. Nothing compares these yet -- what to
# compare them against is a decision nobody has made -- so they are
# artifacts rather than assertions, and the tree beside them is the part
# that is checked.
adb exec-out screencap -p > ./gallery.png 2>/dev/null || true

# How much of the census actually arrived. Not asserted at a number: the
# screen scrolls, and a dump reports what is on screen, so the count is a
# fact about the viewport as much as about the primitives. The comparison
# that matters happens offline against what the compiler emitted.
found=$(grep -o 'resource-id="gallery-[A-Za-z]*"' gallery_dump.xml | sort -u | wc -l)
echo "the gallery tree names $found primitives"
[ "$found" -ge 10 ] || fail "only $found primitives reached the tree, which is not a census"

echo "ok: $package is up, its tree contains $expect_id, the dialog opens and closes, and the gallery renders $found primitives"
