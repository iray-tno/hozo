#!/usr/bin/env bash
# What TalkBack says about the acceptance screen, read off a running
# emulator.
#
# `android-smoke.sh` reads the accessibility tree, which is what TalkBack
# reads *from*. This reads what it says: `speech-log/` is a text-to-speech
# engine that logs every utterance under the `HozoSpeech` tag, it is made
# the default engine, TalkBack is switched on through secure settings, and
# Tab is sent until focus comes back round to where it started.
#
# Needs an image that ships TalkBack -- API 36 does, API 34 does not -- and
# the release APK plus the speech-log APK already built.
#
# Writes `talkback-speech.json` (every step and what it said) and a
# screenshot at the start and the end. The log is written on the way out
# whichever way the run ends, because a failure is when it is worth reading.
# Fails when TalkBack said fewer than MIN_SPOKEN distinct things, because a
# silent reader is the failure a green run hides.

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
package=com.hozonativedemo
activity="${package}/.MainActivity"
apk="$here/../android/app/build/outputs/apk/release/app-release.apk"
speech_apk="$here/../speech-log/build/outputs/apk/debug/speech-log-debug.apk"
engine=dev.hozo.speechlog
talkback=com.google.android.marvin.talkback
talkback_service="$talkback/com.google.android.marvin.talkback.TalkBackService"

MAX_STEPS=${MAX_STEPS:-40}
MIN_SPOKEN=${MIN_SPOKEN:-3}

# What went wrong, and then what TalkBack had been saying when it did.
#
# The speech first, because that is what this script is about. It used to
# print 150 unfiltered logcat lines, and at failure time those were whatever
# the emulator happened to be doing -- `WifiScoreCard`, `InetDiagMessage`,
# `HwcComposer`. The utterances are tagged and were minutes old by then, so
# not one of them survived in the tail. A run once needed exactly those lines
# and the dump carried none (#480).
fail() {
  echo "::error::$*"
  adb exec-out screencap -p > ./talkback-failed.png 2>/dev/null || true
  echo '--- what TalkBack said (last 50) ---'
  spoken | tail -50 | sed 's/^/  /' || true
  # Still some, for the failures that are not about speech at all: a crashed
  # app, a dead emulator, an install that did not take.
  echo '--- logcat (tail) ---'
  adb logcat -d -v brief | tail -40 || true
  exit 1
}

# Every utterance so far, one per line, in order.
spoken() {
  adb logcat -d -v raw -s HozoSpeech:I | tr -d '\r' | grep -v '^--------- ' || true
}

# Acceptance-app markers with logcat timestamps. These are deliberately not
# screen-reader announcements: announcing the measurement would itself move
# or interrupt TalkBack's cursor. The app records the Dialog close edge and
# Android's subsequent window-focus signal; their presence and spacing tell
# us which restore path ran without changing that path.
focus_trace() {
  adb logcat -d -v epoch -s ReactNativeJS:I \
    | tr -d '\r' \
    | grep '\[hozo-dialog-focus\]' \
    || true
}

# `uiautomator` must not run while TalkBack is on. Its UiAutomation connection
# suppresses every other accessibility service, so TalkBack says "TalkBack
# off" and the rest of the run is silence -- which a dump added for
# diagnosis did once, and a count of phrases then passed.
talkback_off() {
  spoken | grep -q '^TalkBack off$'
}
# Until the log has stopped growing for three seconds, up to twenty. TalkBack
# announces the app and the screen on its own after it binds, and arrives
# late enough that a method tried too soon is credited with speech it did
# not cause -- one run said "moving with: key" on exactly that, and every
# step after it was silent.
settle() {
  local last now quiet=0
  last="$(spoken | wc -l)"
  for _ in $(seq 1 20); do
    sleep 1
    now="$(spoken | wc -l)"
    if [ "$now" = "$last" ]; then
      quiet=$((quiet + 1))
      [ "$quiet" -lt 3 ] || return 0
    else
      quiet=0
      last=$now
    fi
  done
}

# `talkback-speech.json`, on the way out, whichever way that is.
#
# It used to be written after the dialog assertions, so any assertion that
# failed skipped it: the artifact of a failed run held two screenshots and no
# speech at all, and the run that most needs the log was the only kind that
# never produced one (#480).
#
# From an EXIT trap instead, so the walk's own record survives a failure
# anywhere after it -- and before it too, since `fail` is reachable while
# there is still no APK, no app and no TalkBack. Missing files read as empty
# rather than as an error, and the whole thing is swallowed: a diagnostic
# that fails must not replace the exit code that says what actually went
# wrong.
write_speech_log() {
  node --eval '
    const fs = require("node:fs")
    const [steps, dialog, trace, calendar, all] = process.argv.slice(1)
    const rows = (file) => {
      if (!file || !fs.existsSync(file)) return []
      return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => {
        const [step, said] = line.split("\t")
        return { step, said: said ? said.split("|") : [] }
      })
    }
    const log = {
      method: "tab",
      utterances: all.split("\n").filter(Boolean),
      steps: rows(steps).map((row) => ({ ...row, step: Number(row.step) })),
      dialog: rows(dialog),
      focusTrace: rows(trace),
      calendar: rows(calendar),
    }
    fs.writeFileSync("talkback-speech.json", JSON.stringify(log, null, 2) + "\n")
  ' "${steps_file:-}" "${dialog_file:-}" "${trace_file:-}" "${calendar_file:-}" "$(spoken)" || true
}
trap write_speech_log EXIT

adb shell settings put global hide_error_dialogs 1 > /dev/null 2>&1 || true

[ -f "$apk" ] || fail "no release APK at $apk"
# Gradle names the APK after the project directory, and that has changed
# before; take whatever the debug build produced.
[ -f "$speech_apk" ] || speech_apk="$(ls "$here"/../speech-log/build/outputs/apk/debug/*.apk 2>/dev/null | head -1)"
[ -f "$speech_apk" ] || fail "no speech-log APK -- did its assembleDebug run?"

if ! adb shell pm list packages "$talkback" | grep -q "$talkback"; then
  echo 'accessibility packages on this image:'
  adb shell pm list packages | grep -i -E 'access|talk|marvin' | sed 's/^/  /' || echo '  (none)'
  fail "this image has no TalkBack (the API 34 one does not; 33, 35 and 36 do)"
fi
echo "TalkBack: $(adb shell dumpsys package "$talkback" | grep -m1 versionName | tr -d '\r' | xargs)"

echo "installing the speech log and the app"
adb install -r "$speech_apk"
adb install -r "$apk"

adb shell settings put secure tts_default_synth "$engine"
# Kept rather than only printed. If the start-up burst goes missing below,
# this is what separates "the engine is not ours" from "the timing was bad",
# and the old warning guessed between them.
default_engine="$(adb shell settings get secure tts_default_synth | tr -d '\r')"
echo "default engine: $default_engine"

adb logcat -c
adb shell am start -W -n "$activity" > /dev/null
sleep 12
[ -n "$(adb shell pidof "$package" | tr -d '\r')" ] || fail "$package did not stay up"

# On after the app, so its first announcement is of this screen rather than
# of the launcher.
#
# Notifications granted first: on its first start TalkBack asks for them,
# and the permission dialog takes focus from the app -- the first run read
# "Allow Android Accessibility Suite to send you notifications?" and then
# could not move at all.
adb shell pm grant "$talkback" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
echo "switching TalkBack on"
adb shell settings put secure enabled_accessibility_services "$talkback_service"
adb shell settings put secure accessibility_enabled 1
# Polled rather than slept: binding took under eight seconds on one run and
# over eight on the next.
bound=
for _ in $(seq 1 30); do
  if adb shell dumpsys accessibility | tr -d '\r' | grep -q 'TalkBackService'; then bound=1; break; fi
  sleep 1
done
[ -n "$bound" ] || fail "TalkBack is not bound thirty seconds after enabling it"
# For the first thing it says, and then for the rest of the burst.
#
# `settle` alone returns as soon as the log has been quiet for three seconds,
# and on a slow boot that is satisfied *before* TalkBack has said anything at
# all -- so the start-up burst was recorded as silence on runs where nothing
# was wrong (#465). Waiting for the first line to arrive, on its own budget,
# is what makes the quiet window mean "it has finished" rather than "it has
# not started".
for _ in $(seq 1 20); do
  [ -z "$(spoken)" ] || break
  sleep 1
done
settle
adb exec-out screencap -p > ./talkback-start.png 2>/dev/null || true

initial="$(spoken)"
echo "said on start:"
printf '%s\n' "$initial" | sed 's/^/  /'
# Still nothing: say what is known instead of naming a cause on no evidence.
#
# The old message was "the engine may not be in use", which is the one thing
# that would make the whole run worthless -- and it said so while the walk
# that followed read the entire screen. A run where the engine really was not
# in use looked identical, so the warning could not be acted on either way.
#
# The engine is not a guess: it was set and read back above.
if [ -z "$initial" ]; then
  if [ "$default_engine" != "$engine" ]; then
    fail "the default TTS engine is \"$default_engine\" rather than $engine, so nothing TalkBack says is being recorded"
  fi
  echo "::warning::TalkBack said nothing before the walk, though $engine is the default engine. Its start-up announcements were missed -- timing, not the engine. What the walk itself says is checked below."
fi

# Tab, because it is the only way of moving that reaches TalkBack from here.
#
# TalkBack's own "next item" was tried every way there is to send it, one
# run each, after letting its start-up announcements finish: Alt+Right from
# `input keycombination`, from the keyboard input source and from the
# emulator's hardware keyboard through its console, and a swipe right at 120
# and 300 ms. All five were silent. Tab moves *input* focus and TalkBack
# follows it and speaks, so what this reads is every focusable element in
# order -- the controls, not the heading or plain text between them. That
# half stays in `VALIDATION.md` until something can drive TalkBack's linear
# navigation.
next() { adb shell input keyevent KEYCODE_TAB; }

# Android's own keyboard announcements, which are not the app speaking.
#
# TalkBack says "Showing Password keyboard", "Showing English (US) (QWERTY)"
# and "keyboard hidden" as the emulator's IME appears, switches or goes away.
# #461 asked whether the first of those meant the email field was being
# treated as a password field. It is not:
#
#   - the demo has one TextInput and it sets no `keyboardType`,
#     `secureTextEntry` or `textContentType`;
#   - the Native `TextInput` is React Native's own, re-exported unchanged by
#     `@hozo/primitives` (`foundation.native.tsx`);
#   - the compiler emits those props only when an author writes them
#     (`crates/hozo_parser/src/jsx.rs` captures, `hozo_native/src/render.rs`
#     renders);
#   - and TalkBack calls the field "Edit box" throughout. A secure field it
#     would call a password.
#
# What settles it is native run 35134881739, whose two laps disagree about
# the same field: the first said "Showing Password keyboard" on the Tab that
# *left* it, and the second said "Showing English (US) (QWERTY)" on the Tab
# that entered it. A field's type does not change between laps; an IME being
# torn down and brought back does.
#
# Dropped here rather than in `spoken`, so `talkback-speech.json` still holds
# every utterance -- that is the material a person approves from. It matters
# beyond tidiness: the steps feed the `distinct` count below, which exists to
# say that TalkBack read the *screen*, and system chatter was counting
# towards it.
without_ime() {
  grep -v -i -E '^(showing .*(keyboard|qwerty).*|keyboard hidden)$' || true
}

# What TalkBack has said since the last call, joined with `|`, in `$new`.
#
# Read once, with both answers taken from that one reading. It used to read the
# log twice -- once to count it, once to slice it -- and TalkBack goes on
# speaking between those two `adb` calls. A line arriving in the gap is in the
# slice but not in the count, so the next step starts before it and says it
# again: a duplicated "Confirm your address" in the dialog step is what that
# looks like from the outside.
#
# The race is not new and is not #479's doing. That branch put two more
# processes inside each reading and so widened the window, but the window was
# always there. Removed rather than narrowed, so that the caller filtering #470
# wants can land on something that does not shift underneath it.
collect() {
  local log
  log="$(spoken)"
  if [ -z "$log" ]; then
    new=
    said_before=0
    return
  fi
  new="$(printf '%s\n' "$log" | tail -n +$((said_before + 1)) | without_ime | paste -sd '|' -)"
  # Counted from the same text rather than from a second reading. The empty
  # case is handled above because `printf` would turn it into one blank line
  # and count it as 1.
  said_before="$(printf '%s\n' "$log" | wc -l)"
}
# One Tab, and what it made TalkBack say.
advance() {
  next
  sleep 2
  settle
  collect
}

settle
said_before="$(spoken | wc -l)"
steps_file="$(mktemp)"
first=
silent=0
for step in $(seq 1 "$MAX_STEPS"); do
  advance
  # The first phrase of a step is the element; what follows is TalkBack's
  # own hints ("Double-tap and hold to long press"). The IME's chatter is
  # already gone, dropped in `collect` above.
  element="${new%%|*}"
  # Tab wraps, so a step naming the first element again is a full lap.
  if [ -n "$first" ] && [ "$element" = "$first" ]; then
    echo "  back at \"$first\" after $((step - 1)) steps"
    break
  fi
  printf '%s\t%s\n' "$step" "$new" >> "$steps_file"
  echo "  $step: ${new:-(silent)}"
  if [ -z "$new" ]; then
    silent=$((silent + 1))
    [ "$silent" -lt 5 ] || break
  else
    silent=0
    [ -n "$first" ] || first=$element
  fi
done

# --- the dialog -------------------------------------------------------------
#
# Continue opens it. Reached by Tab like everything else, opened with Enter --
# DPAD_CENTER if Enter does nothing, since which one a focused Pressable
# answers to is React Native's business -- then Tab a few times inside, then
# Back. `VALIDATION.md` asks three things of it: that opening announces
# "Confirm your address", that focus stays inside, and that dismissing
# returns focus to Continue. The first is checked through the approved
# phrases; the other two are reported as warnings until a run has shown
# what this platform actually does.
# Once by default, `DIALOG_ROUNDS` times when a run is asked to diagnose.
#
# The restore is intermittent (#484): roughly one dismissal in two lands on the
# opener and the rest land on the field above it. Rounds within one emulator
# boot are correlated: the 9-round runs in #484 varied from 8/9 to 4/9. They
# expose within-boot behavior but do not estimate a stable rate. Independent
# boots are the sampling unit, selected by `dialog_boots` in `native.yml`.
#
# The assertion changes with the count, deliberately:
#
#   DIALOG_ROUNDS=1  (default) -- report the measured destination, but warn on
#                     loss. The corrected final-control matcher proved the old
#                     hard gate was a false positive and the real behavior is
#                     intermittent across boots (#484).
#   DIALOG_ROUNDS>1  -- a diagnostic, not a gate. Every round is counted and
#                     only a clean sweep of failures is fatal, because an
#                     intermittent behaviour tried five times will fail
#                     sometimes by definition and a red job would say nothing.
#
# Said here rather than left to be discovered: a green run in the second mode
# has tolerated failures, and its rounds are not independent samples.
opener="Review email address"
dialog_file="$(mktemp)"
trace_file="$(mktemp)"
DIALOG_ROUNDS=${DIALOG_ROUNDS:-1}
restored=0
lost=0
# From the lap, which does not change between rounds.
lap_elements="$(cut -f2 "$steps_file" | sed 's/|.*//' | grep -v "^$opener\$" || true)"

for round in $(seq 1 "$DIALOG_ROUNDS"); do
  # Found again every round rather than assumed. A round that failed leaves
  # focus on the email field, and Enter there types into it instead of opening
  # anything -- so the position has to be re-established from whatever the
  # previous dismissal did.
  reached=
  for _ in $(seq 1 "$MAX_STEPS"); do
    advance
    if [ "${new%%|*}" = "$opener" ]; then reached=1; break; fi
  done
  [ -n "$reached" ] || fail "Tab never reached \"$opener\" in round $round, so the dialog cannot be opened"

  opened=
  for key in KEYCODE_ENTER KEYCODE_DPAD_CENTER; do
    adb shell input keyevent "$key"
    sleep 2
    settle
    collect
    if [ -n "$new" ]; then opened=$key; break; fi
    echo "  $key on \"$opener\": TalkBack said nothing"
  done
  [ -n "$opened" ] || fail "neither Enter nor DPAD_CENTER on \"$opener\" made TalkBack say anything"
  printf 'open %s\t%s\n' "$round" "$new" >> "$dialog_file"
  echo "  round $round opened with $opened: $new"

  for i in 1 2 3; do
    advance
    printf 'inside %s\t%s\n' "$round" "$new" >> "$dialog_file"
    echo "  round $round inside $i: ${new:-(silent)}"
    element="${new%%|*}"
    if [ -n "$element" ] && printf '%s\n' "$lap_elements" | grep -qxF "$element"; then
      echo "::warning::Tab left the dialog in round $round: it reached \"$element\", which is behind it"
    fi
  done

  trace_before="$(focus_trace | wc -l)"
  adb shell input keyevent KEYCODE_BACK
  sleep 2
  settle
  collect
  trace_new="$(focus_trace | tail -n "+$((trace_before + 1))" | paste -sd '|' -)"
  printf 'trace %s\t%s\n' "$round" "$trace_new" >> "$trace_file"
  echo "  round $round focus trace: ${trace_new:-(none)}"
  printf 'dismissed %s\t%s\n' "$round" "$new" >> "$dialog_file"
  echo "  round $round dismissed: ${new:-(silent)}"
  # `|| true` so a dead app reaches the message below: `pidof` exits 1 when it
  # finds nothing, and `set -e` would otherwise end the run at this assignment
  # with no diagnosis at all -- which is how run 35129707377 ended in the smoke
  # script next door.
  still_up="$(adb shell pidof "$package" | tr -d '\r' || true)"
  [ -n "$still_up" ] || fail "Back closed the app rather than the dialog in round $round"
  # Neither the label nor an intermediate Button announcement proves the
  # final destination. TalkBack can announce the opener as a Button and then
  # move its cursor to the email field in the same dismissal. Track the last
  # control role it announced; on this acceptance screen that distinguishes
  # the opener from the only competing focus destination.
  last_control="$(printf '%s\n' "$new" | tr '|' '\n' | grep -E '^(Button|Edit box)(,|$)' | tail -n 1 || true)"
  case "$last_control" in
    Button | Button,*)
      restored=$((restored + 1))
      echo "  round $round: focus returned to \"$opener\""
      ;;
    *)
      lost=$((lost + 1))
      echo "  round $round: focus did NOT return to \"$opener\""
      ;;
  esac
done

echo "focus returned in $restored of $((restored + lost)) dismissals"
if [ "$DIALOG_ROUNDS" -le 1 ]; then
  if [ "$lost" -ne 0 ]; then
    echo "::warning::the last control TalkBack announced after dismissal was not \"$opener\" as a Button (#484)"
  fi
else
  [ "$restored" -gt 0 ] ||
    fail "focus never returned to \"$opener\" in $DIALOG_ROUNDS dismissals, so the restore is not intermittent -- it is gone"
fi

adb exec-out screencap -p > ./talkback-end.png 2>/dev/null || true

talkback_off && fail "TalkBack switched itself off during the run"
# Counted from what the steps said, not from everything: TalkBack announces
# the app and the screen on its own when it starts, so a reader that never
# moved would still pass a count of the whole log.
#
# A floor on "something was read", not a claim that every phrase came from the
# app. The device speaks through TalkBack too -- "Service, Messages is
# restoring backed up message content and data" has landed in a step four
# times -- and those phrases are counted here alongside the screen's.
#
# Left that way on purpose (#470). Separating them is not available: the
# caller UID says which app asked the engine to speak, and for a notification
# that app *is* TalkBack, because reading notifications aloud is what an
# accessibility service does. Two attempts went that way and neither could
# work. What is left -- matching wording, quietening the device, counting only
# each step's first phrase -- either eats real announcements or weakens this
# check, and the check is worth more than the tidiness.
#
# The arithmetic says the risk is small. Chatter adds about one to a count
# whose floor is three, so being fooled needs TalkBack to read nothing *and*
# the device to say three distinct things in the same run. A silent reader
# with a busy device is the one case this would miss, and nothing has ever
# produced it.
distinct=$(cut -f2 "$steps_file" | tr "|" "\n" | sort -u | grep -c . || true)
echo "TalkBack said $distinct distinct things while moving"
[ "$distinct" -ge "$MIN_SPOKEN" ] || fail "TalkBack said only $distinct distinct things, so it did not read the screen"

# Phrases a person approved, in order, as case- and whitespace-insensitive
# substrings of what was said -- the same check `examples/screen-readers`
# makes of NVDA and VoiceOver -- across the lap and then the dialog. No file
# is a warning rather than a failure: approving is the human step, and
# `talkback-speech.json` is what to approve from.
expected="$here/../expected/talkback/acceptance.txt"
if [ ! -f "$expected" ]; then
  echo "::warning::no approved phrases at examples/native-demo/expected/talkback/acceptance.txt; nothing was compared"
else
  node --eval '
    const fs = require("node:fs")
    const [expectedFile, log] = process.argv.slice(1)
    const norm = (text) => text.toLowerCase().replace(/\s+/g, " ").trim()
    const said = log.split("\n").map(norm).filter(Boolean)
    const wanted = fs.readFileSync(expectedFile, "utf8").split("\n").map(norm).filter((line) => line && !line.startsWith("#"))
    let at = 0
    const missing = []
    for (const phrase of wanted) {
      const found = said.findIndex((line, index) => index >= at && line.includes(phrase))
      if (found === -1) missing.push(phrase)
      else at = found + 1
    }
    for (const phrase of missing) console.error(`::error::TalkBack did not say, in order: ${phrase}`)
    process.exit(missing.length ? 1 : 0)
  ' "$expected" "$(cut -f2 "$steps_file" "$dialog_file" | tr "|" "\n")" || fail "TalkBack did not say what was approved"
fi

# What TalkBack says about `@hozo/form`'s Calendar -- reported, never gated.
#
# Last, and after every assertion above has already passed, so a measurement
# cannot take a gate hostage. `::warning::` throughout and `|| true` on
# everything: nothing in this section can fail the job.
#
# It is here because the grid's accessibility design has never met a screen
# reader. Three claims are written into the component's own comments -- that
# a cell's accessible name carries the whole date, that "selected" is spoken,
# and that changing the month announces the new one -- and turning any of
# them into a gate on the first run that produces them would be approving
# them by assertion.
#
# Two of the claims cannot be reached from here at all, and saying so is
# better than a check that reports their absence as a defect.
#
# A day outside `min`/`max` is a `Pressable` with `disabled`, which React
# Native routes to `View.setEnabled(false)` -- so Android drops it from input
# focus and Tab cannot land on it. Whether such a day announces itself as
# unavailable is a question about TalkBack's *linear* navigation, which this
# harness cannot drive (see `next` above, and `VALIDATION.md`). That is
# `docs/decisions/001`'s subject appearing in Hozo's own grid.
#
# The grid's own `accessibilityLabel` is the other. Tab visits focusable
# leaves, and a container is not one, so the label is recorded when it turns
# up and not called missing when it does not.
#
# What the runs have established, so the next reader starts from it:
#
#   - a cell announces as its whole date and then "Button" -- "Friday,
#     September 4, 2026, Button, Double-tap to activate". The date carries,
#     and the cell reads as something operable, which was the least certain
#     of the design decisions.
#   - "selected" reaches the announcement, once the walk is long enough to
#     arrive at the selected day.
#   - paging says "October 2026", so the live region works.
#
# And two facts about the order, which the forty-two step walk settles.
#
# Tab goes down a column and then across: the Friday column top to bottom,
# then Saturday, Sunday, Monday, Tuesday, Wednesday, Thursday. Left to right
# by column, entering at whichever column focus arrived in. The view
# hierarchy is six week rows of seven cells, so this is Android's focus
# sorting rather than child order, and a calendar wants weeks -- a real
# finding, and the cause is not established here.
#
# Thirty-nine cells, not forty-two. The three missing are the 31st of August
# and the 1st and 2nd of September: below `min`, so `disabled`, so
# `View.setEnabled(false)`, so not in the input focus order at all. The
# per-column counts say it exactly -- Monday, Tuesday and Wednesday have
# five where the other four have six. `docs/decisions/001` measured.
calendar_button="Show the calendar"
# The day `CalendarScreen.tsx` pins as the selected one, spelled the way
# `Intl` spells it, so the two files can be read against each other.
calendar_selected="thursday, september 10, 2026"
calendar_file="$(mktemp)"
calendar_reached=
for _ in $(seq 1 "$MAX_STEPS"); do
  advance || true
  if [ "${new%%|*}" = "$calendar_button" ]; then calendar_reached=1; break; fi
done

if [ -z "$calendar_reached" ]; then
  echo "::warning::Tab never reached \"$calendar_button\", so the calendar was not read"
else
  calendar_opened=
  for key in KEYCODE_ENTER KEYCODE_DPAD_CENTER; do
    adb shell input keyevent "$key" || true
    sleep 2
    settle || true
    collect || true
    if [ -n "$new" ]; then calendar_opened=$key; break; fi
  done
  if [ -z "$calendar_opened" ]; then
    echo "::warning::neither Enter nor DPAD_CENTER opened the calendar screen"
  else
    printf 'open\t%s\n' "$new" >> "$calendar_file"
    echo "  calendar opened with $calendar_opened: $new"

    # Whether the app survived opening the screen, asked before anything is
    # read from it.
    #
    # The first run of this section needed it. TalkBack answered with the
    # launcher -- "Home", "At a glance", "Gmail", "Google Lens" -- from the
    # step after the button was pressed, and every check below then reported
    # that the calendar had not said its own name. Which was true, and told
    # nobody anything: a release build has no red box, so a JavaScript error
    # while a screen mounts takes the process with it and leaves the reader
    # on whatever is behind.
    #
    # So the difference between "the grid said the wrong thing" and "there
    # was no grid" is worth one `pidof` and the crash buffer.
    if [ -z "$(adb shell pidof "$package" | tr -d '\r' || true)" ]; then
      echo "::warning::the app was gone after opening the calendar, so nothing below was measured"
      adb logcat -d -b crash -v brief 2>/dev/null | tail -40 | sed 's/^/  crash: /' || true
      adb logcat -d -v brief '*:E' 2>/dev/null |
        grep -iE 'reactnative|hermes|hozo' | tail -40 | sed 's/^/  error: /' || true
    else
      # The whole grid, forty-two cells. Twenty was the first guess and it
      # was wrong for a reason worth keeping: the order Tab uses is not the
      # order the rows are built in, so "far enough to reach the interesting
      # cell" cannot be reasoned about from the layout. Forty-two is about
      # two minutes more and leaves nothing to reason about.
      for i in $(seq 1 42); do
        advance || true
        printf 'day %s\t%s\n' "$i" "$new" >> "$calendar_file"
        echo "  calendar $i: ${new:-(silent)}"
      done

      # The month is a live region, so it is announced when it changes rather
      # than when anything focuses it -- which means pressing the button is the
      # only way to ask whether it works.
      for _ in $(seq 1 "$MAX_STEPS"); do
        advance || true
        if [ "${new%%|*}" = "Next month" ]; then break; fi
      done
      if [ "${new%%|*}" = "Next month" ]; then
        adb shell input keyevent KEYCODE_ENTER || true
        sleep 2
        settle || true
        collect || true
        printf 'paged\t%s\n' "$new" >> "$calendar_file"
        echo "  calendar paged: ${new:-(silent)}"
      else
        echo "::warning::Tab never reached the calendar's next-month button"
      fi

      calendar_said="$(cut -f2 "$calendar_file" | tr '|' '\n' | grep -v '^$' || true)"
      heard() {
        if printf '%s\n' "$calendar_said" | grep -qi -- "$2"; then
          echo "  heard: $1"
        else
          echo "::warning::the calendar never said $1 -- read talkback-speech.json"
        fi
      }
      heard 'a whole date on a cell' 'september [0-9]*, 2026'
      heard 'the month it paged to' 'october 2026'
      # `todayLabel` reaches the announcement through `accessibilityValue.text`,
      # which `BaseViewManager` joins onto the label with ", " -- so the shape
      # to look for is the date and then the word, not the word alone. Today is
      # pinned to the 24th in `CalendarScreen.tsx`.
      heard 'that a day is today' 'september 24, 2026, today'

      # Three answers, not two. The first run of this section warned that the
      # grid never called a day selected, which was true and misleading: the
      # walk had not reached the selected day at all -- twenty Tabs had gone
      # down the Friday column and the 10th is a Thursday. "Focused and not
      # announced" and "never focused" are different findings and now read
      # differently.
      selected_step="$(grep -i -- "$calendar_selected" "$calendar_file" || true)"
      if [ -z "$selected_step" ]; then
        echo "::warning::the walk never focused $calendar_selected, so selected was not measured"
      elif printf '%s\n' "$selected_step" | grep -qi 'selected'; then
        echo "  heard: that a day is selected"
      else
        echo "::warning::$calendar_selected was focused and TalkBack did not call it selected"
      fi

      # Recorded, not asserted. Tab moves between focusable leaves, so the
      # grid container is never focused and its own label is not something
      # this harness can ask about -- the same limit as the disabled days.
      if printf '%s\n' "$calendar_said" | grep -qi 'departure date'; then
        echo "  heard: the grid label, which Tab was not expected to reach"
      else
        echo "  not measurable by Tab: the grid's label, since only leaves are focused"
      fi

      # The order they came in, so a reader can see it without the log. The
      # first run went down the Friday column and then the Saturday column
      # rather than along the weeks, which is not the order the rows are
      # built in and is not yet explained.
      echo '  --- the order Tab visited them ---'
      cut -f2 "$calendar_file" | sed 's/|.*//' | sed 's/^/    /'
    fi
  fi
fi

# Replacing the screen while TalkBack is on, which used to take the process
# with it (#512).
#
# The Gallery button has always done this -- `if (showingGallery) return
# <Gallery />` unmounts the acceptance screen's `FlatList` -- and has never
# crashed here, because this script reads that button and `android-smoke.sh`
# presses it with TalkBack off. Neither half pressed it with a screen reader
# running, so the crash lived in the gap between them for as long as the
# button has existed.
#
# A gate rather than a warning, unlike everything above it. "The app is still
# there" is not a judgement about what a screen reader said, and it does not
# depend on timing: press, wait, ask for the pid.
#
# Restarted first rather than navigated back to. Whatever the calendar section
# left behind -- a modal open, focus inside it, nothing at all if it never got
# there -- is not a state this wants to reason about, and Back on the
# acceptance screen leaves the app rather than the screen.
echo "restarting the app to replace its screen with TalkBack on"
adb shell am force-stop "$package" || true
adb shell am start -W -n "$activity" > /dev/null
sleep 12
[ -n "$(adb shell pidof "$package" | tr -d '\r')" ] || fail "$package did not come back up"
settle
said_before="$(spoken | wc -l)"

gallery_button="Show every primitive"
gallery_reached=
for _ in $(seq 1 "$MAX_STEPS"); do
  advance
  if [ "${new%%|*}" = "$gallery_button" ]; then gallery_reached=1; break; fi
done

if [ -z "$gallery_reached" ]; then
  echo "::warning::Tab never reached \"$gallery_button\", so the teardown was not exercised"
else
  adb shell input keyevent KEYCODE_ENTER
  sleep 3
  settle
  collect
  echo "  gallery opened: ${new:-(silent)}"
  if [ -z "$(adb shell pidof "$package" | tr -d '\r' || true)" ]; then
    echo '--- logcat, crash buffer ---'
    adb logcat -d -b crash -v brief | tail -60 || true
    fail "the app died replacing its screen while TalkBack was on -- #512 again"
  fi
  echo "  the app survived replacing its screen"
fi

echo "ok"
