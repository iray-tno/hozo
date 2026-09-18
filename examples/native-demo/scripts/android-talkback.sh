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

# Every utterance so far, one per line, in order, each still carrying the UID
# of whoever asked for it.
spoken_raw() {
  adb logcat -d -v raw -s HozoSpeech:I | tr -d '\r' | grep -v '^--------- ' || true
}

# The same, as plain text. Everything the device said, TalkBack's or not.
#
# What `settle` waits on, what `talkback_off` searches, and what goes into
# `talkback-speech.json`: the artifact holds every utterance, because that is
# the material a person approves from -- and because the device's own speech
# in it is exactly what made #470 diagnosable.
spoken() {
  spoken_raw | sed 's/^[0-9][0-9]*://'
}

# Of those, the ones TalkBack asked for, with the prefix removed.
#
# Used on the steps and nowhere else, beside `without_ime` and for the same
# reason. An unset `talkback_uid` means the lookup failed, and then nothing is
# dropped: a filter matching nothing would empty the steps, which reads as a
# reader that never spoke -- the failure this script exists to catch, arriving
# as a false alarm.
from_talkback() {
  if [ -n "${talkback_uid:-}" ]; then
    sed -n "s/^${talkback_uid}://p"
  else
    sed 's/^[0-9][0-9]*://'
  fi
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
    const [steps, dialog, all] = process.argv.slice(1)
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
    }
    fs.writeFileSync("talkback-speech.json", JSON.stringify(log, null, 2) + "\n")
  ' "${steps_file:-}" "${dialog_file:-}" "$(spoken)" || true
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

# Which UID TalkBack speaks as, so the steps can keep its utterances and drop
# whatever else the device says through the same engine (#470).
#
# Measured before it was used, in #482: `pm list packages -U` prints
# `package:<name> uid:<n>` and gave 10160 on the API 36 image, while
# `dumpsys package | grep userId=` -- what an earlier attempt filtered on --
# returned nothing at all, because the field there is `uid=`. That attempt
# failed open and the warning was the only sign.
#
# Matched on the whole package name, not a substring: `pm list packages -U
# com.google.android.marvin.talkback` also returns `…talkbackoverlay uid:10092`,
# and taking the first line would filter every real utterance away.
talkback_uid="$(adb shell pm list packages -U | tr -d '\r' |
  grep -m1 "^package:${talkback} uid:" | sed 's/.*uid://' || true)"
[ -n "$talkback_uid" ] || talkback_uid="$(adb shell dumpsys package "$talkback" |
  tr -d '\r' | grep -m1 -o 'uid=[0-9]*' | cut -d= -f2 || true)"
if [ -n "$talkback_uid" ]; then
  echo "TalkBack uid: $talkback_uid"
else
  echo "::warning::could not read TalkBack's uid, so the steps keep every utterance and the device's own speech may be credited to one (#470)"
fi

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
  log="$(spoken_raw)"
  if [ -z "$log" ]; then
    new=
    said_before=0
    return
  fi
  # Sliced by position first, then filtered. The offset counts every line the
  # device produced, so dropping some before the slice would move the boundary
  # under the next step.
  new="$(printf '%s\n' "$log" | tail -n +$((said_before + 1)) | from_talkback | without_ime | paste -sd '|' -)"
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
opener="Review email address"
dialog_file="$(mktemp)"
reached=
for _ in $(seq 1 "$MAX_STEPS"); do
  advance
  if [ "${new%%|*}" = "$opener" ]; then reached=1; break; fi
done
[ -n "$reached" ] || fail "Tab never reached \"$opener\", so the dialog cannot be opened"

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
printf 'open\t%s\n' "$new" >> "$dialog_file"
echo "  opened with $opened: $new"

lap_elements="$(cut -f2 "$steps_file" | sed 's/|.*//' | grep -v "^$opener\$" || true)"
for i in 1 2 3; do
  advance
  printf 'inside\t%s\n' "$new" >> "$dialog_file"
  echo "  inside $i: ${new:-(silent)}"
  element="${new%%|*}"
  if [ -n "$element" ] && printf '%s\n' "$lap_elements" | grep -qxF "$element"; then
    echo "::warning::Tab left the dialog: it reached \"$element\", which is on the screen behind it"
  fi
done

adb shell input keyevent KEYCODE_BACK
sleep 2
settle
collect
printf 'dismissed\t%s\n' "$new" >> "$dialog_file"
echo "  dismissed: ${new:-(silent)}"
# `|| true` so a dead app reaches the message below: `pidof` exits 1 when it
# finds nothing, and `set -e` would otherwise end the run at this assignment
# with no diagnosis at all -- which is how run 35129707377 ended in the smoke
# script next door.
still_up="$(adb shell pidof "$package" | tr -d '\r' || true)"
[ -n "$still_up" ] || fail "Back closed the app rather than the dialog"
# Asserted rather than warned about, since #463 made it work: run
# 35100769638 announced "Review email address" on dismissal. A run that does
# not is a regression in `Dialog`'s `restoreFocusTo`, not an open question.
case "|$new|" in
  *"|$opener|"*) echo "  focus returned to \"$opener\"" ;;
  *) fail "dismissing the dialog did not announce \"$opener\", so focus did not return to it" ;;
esac

adb exec-out screencap -p > ./talkback-end.png 2>/dev/null || true

talkback_off && fail "TalkBack switched itself off during the run"
# Counted from what the steps said, not from everything: TalkBack announces
# the app and the screen on its own when it starts, so a reader that never
# moved would still pass a count of the whole log.
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

echo "ok"
