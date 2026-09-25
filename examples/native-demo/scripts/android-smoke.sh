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
  # The crash buffer first, and unfiltered. The tail of the main buffer is
  # whatever the emulator happened to be doing, which for a dead app is
  # `StrictMode` and `SemanticLocation` and nothing about the app at all --
  # run 35933647784 failed with "started and then died" and its two hundred
  # lines named the process once, in the line that said it had started. The
  # same shape #480 fixed in `android-talkback.sh`; this half kept it.
  echo '--- logcat, crash buffer ---'
  adb logcat -d -b crash -v brief | tail -80 || true
  echo '--- logcat ---'
  adb logcat -d -v brief | tail -200 || true
  exit 1
}

# Whether the app is still running, and what killed it if not.
#
# The crash check used to run once, right after launch, which covers a
# render that throws on the first frame and nothing after it. A screen
# reached by pressing something can throw too, and when it does the app
# dies and the launcher becomes visible -- so the next dump is of the home
# screen and the failure reads as "the thing did not open". It was not the
# tap; it was the screen.
still_alive() {
  local what="$1"
  # shellcheck disable=SC2001 -- the CR below is literal on purpose; adb's
  # shell output is CRLF and every other reader here strips it the same way.
  if [ -z "$(adb shell pidof "$package" | tr -d '')" ]; then
    echo '--- the exception ---'
    adb logcat -d | grep -A 30 'FATAL EXCEPTION' | tail -40 || true
    # A native crash leaves no FATAL EXCEPTION at all, only a tombstone in
    # the crash buffer, so both are asked for.
    echo '--- logcat, crash buffer ---'
    adb logcat -d -b crash -v brief | tail -80 || true
    fail "$package died $what"
  fi
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
#
# The attribute is an argument because not everything on this screen has a
# `testID`. The calendar's opener deliberately has none -- a new `testID` in
# `App.tsx` has to appear in the dump checked into `fixtures/` or
# `missingOnDevice` fails -- so it is found by `content-desc`, which is what
# its `accessibilityLabel` becomes.
centre_of() {
  node --eval '
    const [file, wanted, attr = "resource-id"] = process.argv.slice(1)
    const xml = require("node:fs").readFileSync(file, "utf8")
    for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
      if (!node[0].includes(`${attr}="${wanted}"`)) continue
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
  ' "$1" "$2" "${3:-resource-id}"
}

# No system error dialogs, because the ones that appear here belong to
# other apps.
#
# A loaded emulator makes the launcher miss its deadline, and Android puts
# "Pixel Launcher isn't responding" in front of everything -- including
# this app, which is running perfectly well behind it. `uiautomator` dumps
# the frontmost window, so the tree becomes that dialog and the run fails
# saying this app rendered nothing.
#
# Dismissing it does not work: pressing Wait tells Android to keep waiting
# for the app that is stuck, and a launcher that is still stuck raises the
# dialog again. Three attempts over thirty-eight seconds were not enough on
# one run, and a fourth would be the same guess with a bigger number.
#
# `hide_error_dialogs` is the setting Android has for exactly this. It
# suppresses crash and ANR dialogs, which costs this script nothing: it
# judges whether the app is alive from `pidof` and whether it crashed from
# `FATAL EXCEPTION` in logcat, neither of which is a dialog. What it stops
# is another app's dialog being mistaken for this one's tree.
adb shell settings put global hide_error_dialogs 1 > /dev/null 2>&1 || true
echo "error dialogs hidden: $(adb shell settings get global hide_error_dialogs | tr -d '\r')"

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
# `|| true` for the reason spelled out at the next `pidof` below: without it
# a process that never started kills the script here, and the message that
# says so never prints.
pid="$(adb shell pidof "$package" | tr -d '\r' || true)"
[ -n "$pid" ] || fail "$package never started"
echo "started as pid $pid"

# Long enough for a crash on first render to have happened, and long enough
# for the screen to stop drawing. The second is what `uiautomator dump`
# needs: it waits for an idle window and gives up on its own schedule, and
# this screen fetches a remote image, measures a grid, and settles a
# transition before it is done.
sleep 12
# `|| true` because `pidof` exits 1 when it finds nothing, and under
# `set -e` that kills the script *at this assignment* -- before the message
# below, before the logcat dump, before the screenshot. Run 35129707377 did
# exactly that: the app was gone twelve seconds after launch and the log
# said nothing at all beyond "started as pid".
#
# Through `still_alive` rather than a bare `fail`, which is the difference
# between a dump and a diagnosis: that function greps the exception out
# first, and this call site -- the one place the app is most likely to be
# gone -- was the one not using it.
still_alive "twelve seconds after launch"

# `FATAL EXCEPTION` covers a Java-side crash that took the process with it;
# the process check above would catch that too, but the message is the
# useful part.
if adb logcat -d | grep -q 'FATAL EXCEPTION'; then
  fail "$package logged a fatal exception"
fi

# A system dialog on top of everything, which is not the app failing.
#
# `uiautomator` dumps the frontmost window, and on a loaded runner that
# can be Android's own "isn't responding" dialog -- for the *launcher*,
# not for this app, which the run that found this had happily rendered
# and even fetched its remote image. The tree is then a `package="android"`
# alert with Close app and Wait in it, `smoke-list` is legitimately absent,
# and the failure reads as "the app rendered nothing".
#
# Pressing Wait dismisses it and leaves whatever was behind it in front.
# One retry: if a second dialog arrives, the emulator is too slow to be
# asked this question and saying that is more useful than pressing buttons
# in a loop.
dismiss_system_dialog() {
  local into="$1"
  grep -q "isn't responding" "$into" || return 0
  echo "a system dialog is in front of the app despite hide_error_dialogs:"
  grep -o 'text="[^"]*isn.t responding"' "$into" | sed 's/^/  /' || true

  # The dialog belongs to whichever app stopped responding, and on this
  # runner that has always been the launcher. Pressing Wait was tried and
  # does not hold -- Android raises it again while that app is still stuck
  # -- so the app is stopped instead. Nothing here needs a launcher: this
  # app owns the screen for the rest of the run, and Android restarts the
  # launcher on its own when something asks for HOME.
  #
  # Resolved rather than spelled: the emulator image decides which launcher
  # it ships, and `com.google.android.apps.nexuslauncher` is true of this
  # one image rather than of Android.
  local home
  # `|| true` because `pipefail` carries a failing `adb` out of the pipeline,
  # and this is a question the caller is allowed to get no answer to: the
  # `[ -n "$home" ]` below is the handling.
  home="$(adb shell cmd package resolve-activity -c android.intent.category.HOME --brief 2>/dev/null | tail -1 | tr -d '\r' | cut -d/ -f1 || true)"
  if [ -n "$home" ] && [ "$home" != "$package" ]; then
    echo "  stopping $home, which is the app that is not responding"
    adb shell am force-stop "$home" || true
  fi

  # Dismissing another app's dialog leaves whatever was behind it in front,
  # which may be the launcher rather than this app. Asking for the activity
  # again is safe in the middle of the dialog round trip because
  # `MainActivity` is `singleTask`: the running instance comes forward with
  # `onNewIntent` rather than a second one starting.
  adb shell am start -n "$activity" > /dev/null 2>&1 || true
  sleep 5
  still_alive 'while a system dialog was in front of it'
  dump "$into"
  grep -q "isn't responding" "$into" || return 0

  fail 'a system dialog is still in front after stopping the app that raised it'
}

echo "reading the accessibility tree"
dump window_dump.xml
dismiss_system_dialog window_dump.xml
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
still_alive 'while opening the dialog'

dump dialog_dump.xml
dismiss_system_dialog dialog_dump.xml
if ! grep -q 'smoke-dialog' dialog_dump.xml; then
  echo '--- tree after pressing Continue ---'
  cat dialog_dump.xml
  fail "pressing Continue did not open the dialog"
fi
echo "the dialog is open"

echo "dismissing with Back"
adb shell input keyevent 4
sleep 2
still_alive 'while dismissing the dialog'
dump dismissed_dump.xml
dismiss_system_dialog dismissed_dump.xml
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
still_alive 'while opening the gallery'

dump gallery_dump.xml
dismiss_system_dialog gallery_dump.xml
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

# Which of the census the tree names, and which it does not.
#
# Printed rather than asserted. `uiautomator dump` reports a fixed set of
# attributes and a `roleDescription` is not among them, so an element can
# be reaching the platform correctly and still be invisible here -- which
# is one of the two open questions about `Progress` in #309. A list of
# names is what turns that from a guess into a comparison.
echo "the census, as the tree has it:"
node --eval '
  const [dump, screen] = process.argv.slice(1)
  const fs = require("node:fs")
  const inTree = new Set(
    [...fs.readFileSync(dump, "utf8").matchAll(/resource-id="(gallery-\w+)"/g)].map((m) => m[1]),
  )
  const written = new Set(
    [...fs.readFileSync(screen, "utf8").matchAll(/testID="(gallery-\w+)"/g)].map((m) => m[1]),
  )
  const missing = [...written].filter((name) => !inTree.has(name)).sort()
  console.log(`  ${inTree.size} of ${written.size} named`)
  console.log(`  absent: ${missing.join(", ") || "(none)"}`)
' gallery_dump.xml "$(dirname "$0")/../Gallery.tsx"

# How much of the census actually arrived. Not asserted at a number: the
# screen scrolls, and a dump reports what is on screen, so the count is a
# fact about the viewport as much as about the primitives. The comparison
# that matters happens offline against what the compiler emitted.
found=$(grep -o 'resource-id="gallery-[A-Za-z]*"' gallery_dump.xml | sort -u | wc -l)
echo "the gallery tree names $found primitives"
[ "$found" -ge 10 ] || fail "only $found primitives reached the tree, which is not a census"

# Where the calendar's cells actually are.
#
# `android-talkback.sh` measured the order Tab visits them: down the Friday
# column, then Saturday, then Sunday, rather than along the weeks (#514). The
# view hierarchy is six week rows of seven cells each, so child order would
# be row-major and Android produced something else. Two readings, and only
# one of them is ours:
#
#   - the rows are not laid out as rows, and the grid is transposed or
#     collapsed in a way the styles did not intend;
#   - or Android's focus sorting does this to a grid of nested rows, in which
#     case every React Native grid has it and it is not ours to fix.
#
# `bounds` tells them apart, and this dump is the only place bounds come
# from. Counting distinct tops and lefts is the whole test: six tops and
# seven lefts means the rows are rows.
#
# Answered, the first time this ran: six tops, seven lefts, and the topmost
# band is Monday the 31st of August through Sunday the 6th of September in
# order. The second reading. Kept rather than deleted, because it is the only
# thing that would notice the styles breaking later -- a transposed grid would
# show up here as seven tops and six lefts.
#
# One cell short of forty-two, which is not explained. A dump reports what is
# on screen and the last row sits near the bottom edge, so a clipped cell is
# the likely answer; it is not the answer this was asked for and is not
# treated as one.
#
# Reported, never asserted, and last. The gallery above replaced the screen,
# so the app is restarted to get the opener back, and nothing after this
# needs it.
echo "restarting to read the calendar's geometry"
adb shell am force-stop "$package" || true
adb shell am start -W -n "$activity" > /dev/null
sleep 8
if [ -z "$(adb shell pidof "$package" | tr -d '\r' || true)" ]; then
  echo "::warning::the app did not come back, so the calendar's geometry was not read"
else
  adb shell uiautomator dump /sdcard/dump.xml > /dev/null 2>&1 || true
  adb pull /sdcard/dump.xml ./calendar_opener_dump.xml > /dev/null 2>&1 || true
  if opener="$(centre_of calendar_opener_dump.xml 'Show the calendar' content-desc)"; then
    # shellcheck disable=SC2086 -- two words, deliberately unquoted
    adb shell input tap $opener
    sleep 3
    adb shell uiautomator dump /sdcard/dump.xml > /dev/null 2>&1 || true
    adb pull /sdcard/dump.xml ./calendar_dump.xml > /dev/null 2>&1 || true
    adb exec-out screencap -p > ./calendar.png 2>/dev/null || true
    node --eval '
      const fs = require("node:fs")
      const file = process.argv[1]
      if (!fs.existsSync(file)) {
        console.log("::warning::no calendar dump, so no geometry")
        process.exit(0)
      }
      const xml = fs.readFileSync(file, "utf8")
      const cells = []
      for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
        const name = /content-desc="([A-Za-z]+day, [A-Za-z]+ \d+, \d+)"/.exec(node[0])
        const box = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node[0])
        if (!name || !box) continue
        const [left, top, right, bottom] = box.slice(1).map(Number)
        cells.push({ name: name[1], left, top, right, bottom })
      }
      if (cells.length === 0) {
        console.log("::warning::the calendar dump names no day cells")
        process.exit(0)
      }
      const tops = new Set(cells.map((cell) => cell.top))
      const lefts = new Set(cells.map((cell) => cell.left))
      console.log(`  ${cells.length} day cells, ${tops.size} distinct tops, ${lefts.size} distinct lefts`)
      // Six rows of seven is what the styles ask for. Anything else is the
      // first of the two readings above, and the numbers say which.
      const asBuilt = tops.size === 6 && lefts.size === 7
      console.log(`  laid out as ${asBuilt ? "rows, so the order is Android\x27s doing" : "something other than six rows of seven"}`)
      const firstTop = Math.min(...tops)
      const firstRow = cells.filter((cell) => cell.top === firstTop).sort((a, b) => a.left - b.left)
      console.log(`  the topmost band, left to right: ${firstRow.map((cell) => cell.name).join(" | ")}`)
    ' ./calendar_dump.xml || true
  else
    echo "::warning::could not find the calendar opener in the tree, so no geometry"
  fi
fi


# What the pickers screen puts in the accessibility tree.
#
# `TimePicker`, `DateTimePicker` and `DateRangePicker` have Native halves that
# had never been executed anywhere when this was written -- the Web halves are
# covered by the Storybook goldens (#554) and the Node suites, and neither of
# those runs a `Pressable`. So the first question is not what TalkBack says
# about them, it is whether they render at all.
#
# A dump answers that, and answers two more things a browser cannot:
#
#   - whether `accessibilityValue.text` reaches `content-desc`. The fields are
#     supposed to say the whole time rather than their own digits, and Android
#     joins label, state and value into one `contentDescription` -- so "9:30"
#     appearing beside "Hour" is the join working, and "Hour" alone is it not.
#   - which clock the fields are on. `hour12` is passed explicitly, so a field
#     reading 9 with a period button beside it says `withPeriod` and
#     `twelveHour` behave on Hermes; the period button missing would say they
#     do not.
#
# Reported, never asserted, and after the calendar geometry. The app is
# restarted because that section left a modal open, and nothing after this
# needs the screen.
echo "restarting to read the pickers screen"
adb shell am force-stop "$package" || true
adb shell am start -W -n "$activity" > /dev/null
sleep 8
if [ -z "$(adb shell pidof "$package" | tr -d '\r' || true)" ]; then
  echo "::warning::the app did not come back, so the pickers were not read"
else
  adb shell uiautomator dump /sdcard/dump.xml > /dev/null 2>&1 || true
  adb pull /sdcard/dump.xml ./pickers_opener_dump.xml > /dev/null 2>&1 || true
  if opener="$(centre_of pickers_opener_dump.xml 'Show the pickers' content-desc)"; then
    # shellcheck disable=SC2086 -- two words, deliberately unquoted
    adb shell input tap $opener
    sleep 3
    # Asked before the dump, so that "the tree named nothing" and "there was
    # no process" cannot be confused. A release build has no red box, so a
    # throw while a screen mounts takes the process with it -- which is what
    # the calendar section learned the hard way.
    if [ -z "$(adb shell pidof "$package" | tr -d '\r' || true)" ]; then
      echo "::warning::the app died opening the pickers screen"
      adb logcat -d -b crash -v brief 2>/dev/null | tail -40 | sed 's/^/  crash: /' || true
    else
      adb shell uiautomator dump /sdcard/dump.xml > /dev/null 2>&1 || true
      adb pull /sdcard/dump.xml ./pickers_dump.xml > /dev/null 2>&1 || true
      adb exec-out screencap -p > ./pickers.png 2>/dev/null || true
      node --eval '
        const fs = require("node:fs")
        const file = process.argv[1]
        if (!fs.existsSync(file)) {
          console.log("::warning::no pickers dump, so nothing was read")
          process.exit(0)
        }
        const xml = fs.readFileSync(file, "utf8")
        // Both attributes, because only one of them is a description. A
        // `content-desc` is what a screen reader says; a bare `text` is drawn
        // and not described. Reading only the first cannot tell "the field is
        // not in the tree" from "the field is in the tree with nothing said
        // about it", and those are different bugs with different fixes.
        const described = []
        const drawn = []
        for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
          const desc = /content-desc="([^"]+)"/.exec(node[0])
          if (desc) described.push(desc[1])
          const text = /\stext="([^"]+)"/.exec(node[0])
          if (text && !desc) drawn.push(text[1])
        }
        if (described.length === 0 && drawn.length === 0) {
          console.log("::warning::the pickers dump names nothing at all")
          process.exit(0)
        }
        console.log(`  ${described.length} described nodes:`)
        for (const one of described) console.log(`    ${one}`)
        console.log(`  ${drawn.length} drawn but undescribed:`)
        for (const one of drawn) console.log(`    ${one}`)
        // Reported one line each rather than as a pass or a fail: this is a
        // measurement, and a name that is nearly right is the interesting
        // answer. The patterns are deliberately exact -- the first version
        // asked for "hour" and was answered by "Increase Hour", so it reported
        // the fields as described while looking at their buttons.
        const has = (what) => described.some((one) => one.toLowerCase().includes(what))
        const note = (what, found) =>
          console.log(`  ${found ? "said" : "did not say"} ${what}`)
        note("the hour steppers", has("increase hour"))
        note("the minute steppers", has("increase minute"))
        note("the period, with the whole time on it", has("am or pm, 9:30"))
        note("the DateTimePicker trigger", has("departure"))
        note("the DateRangePicker trigger", has("dates of stay"))
        // The fields as opposed to their buttons. Nothing matched this on the
        // first run: the value a reader is changing is not described anywhere.
        note(
          "the hour and minute fields themselves",
          described.some((one) => /^(hour|minute)\b/i.test(one)),
        )
      ' ./pickers_dump.xml || true
    fi
  else
    echo "::warning::could not find the pickers opener in the tree, so nothing was read"
  fi
fi
echo "ok: $package is up, its tree contains $expect_id, the dialog opens and closes, and the gallery renders $found primitives"
