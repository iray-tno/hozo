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
MIN_SPOKEN=${MIN_SPOKEN:-2}

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
  # The module's own report, which the tail below will not contain. logcat on
  # this emulator is a firehose -- `resolv`, `Icing`, `Bugle` -- and these lines
  # are written at dismissal, many screenfuls of chatter ago. Filtered by tag
  # rather than searched for, because `-s` is the one way to be sure.
  echo '--- what @hozo/native said ---'
  adb logcat -d -v brief -s HozoA11y | tail -20 || true
  echo '--- logcat (tail) ---'
  adb logcat -d -v brief | tail -40 || true
  exit 1
}

# Every utterance so far, one per line, in order.
spoken() {
  adb logcat -d -v raw -s HozoSpeech:I | tr -d '\r' | grep -v '^--------- ' || true
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
# Once by default, `DIALOG_ROUNDS` times when a run is asked to measure.
#
# The restore is intermittent (#484): roughly one dismissal in two lands on the
# opener and the rest land on the field above it. At one round per run a single
# sample costs a whole boot, and `native.yml`'s concurrency group cancels
# in-progress runs on the same ref, so samples cannot be gathered in parallel
# either -- which is what made the rate expensive to establish.
#
# The assertion changes with the count, deliberately:
#
#   DIALOG_ROUNDS=1  (default) -- exactly what it has always been. A dismissal
#                     that does not announce the opener fails the job, which is
#                     the guarantee #463 added and this keeps gating.
#   DIALOG_ROUNDS>1  -- a measurement, not a gate. Every round is counted and
#                     only a clean sweep of failures is fatal, because an
#                     intermittent behaviour tried five times will fail
#                     sometimes by definition and a red job would say nothing.
#
# Said here rather than left to be discovered: a green run in the second mode
# has tolerated failures, and anyone reading one needs to know that.
opener="Review email address"
dialog_file="$(mktemp)"
DIALOG_ROUNDS=${DIALOG_ROUNDS:-8}
restored=0
lost=0
restored_scale_0=0
lost_scale_0=0
restored_scale_1=0
lost_scale_1=0
# From the lap, which does not change between rounds.
lap_elements="$(cut -f2 "$steps_file" | sed 's/|.*//' | grep -v "^$opener\$" || true)"
echo "animation scales before the probe: window=$(adb shell settings get global window_animation_scale | tr -d '\r') transition=$(adb shell settings get global transition_animation_scale | tr -d '\r') animator=$(adb shell settings get global animator_duration_scale | tr -d '\r')"

for round in $(seq 1 "$DIALOG_ROUNDS"); do
  # Probe #484's suspiciously exact boundary. React Native's fade-out uses
  # Android's config_shortAnimTime, which is 200ms on this image -- the same
  # number at which the delay sweep starts succeeding. Alternate the scale in
  # one boot so TalkBack version, app build and emulator load are held fixed.
  # The runner asks for disabled animations, but the setting is read back here
  # rather than trusted, then deliberately overridden for each round.
  if [ $((round % 2)) -eq 1 ]; then
    animation_scale=1
  else
    animation_scale=0
  fi
  adb shell settings put global window_animation_scale "$animation_scale"
  adb shell settings put global transition_animation_scale "$animation_scale"
  adb shell settings put global animator_duration_scale "$animation_scale"
  actual_window_scale="$(adb shell settings get global window_animation_scale | tr -d '\r')"
  actual_transition_scale="$(adb shell settings get global transition_animation_scale | tr -d '\r')"
  actual_animator_scale="$(adb shell settings get global animator_duration_scale | tr -d '\r')"
  echo "  round $round animation scales: window=$actual_window_scale transition=$actual_transition_scale animator=$actual_animator_scale"

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
  printf 'open scale=%s round=%s\t%s\n' "$animation_scale" "$round" "$new" >> "$dialog_file"
  echo "  round $round opened with $opened: $new"

  for i in 1 2 3; do
    advance
    printf 'inside scale=%s round=%s\t%s\n' "$animation_scale" "$round" "$new" >> "$dialog_file"
    echo "  round $round inside $i: ${new:-(silent)}"
    element="${new%%|*}"
    if [ -n "$element" ] && printf '%s\n' "$lap_elements" | grep -qxF "$element"; then
      echo "::warning::Tab left the dialog in round $round: it reached \"$element\", which is behind it"
    fi
  done

  adb shell input keyevent KEYCODE_BACK
  sleep 2
  settle
  collect
  printf 'dismissed scale=%s round=%s\t%s\n' "$animation_scale" "$round" "$new" >> "$dialog_file"
  echo "  round $round dismissed: ${new:-(silent)}"
  # `|| true` so a dead app reaches the message below: `pidof` exits 1 when it
  # finds nothing, and `set -e` would otherwise end the run at this assignment
  # with no diagnosis at all -- which is how run 35129707377 ended in the smoke
  # script next door.
  still_up="$(adb shell pidof "$package" | tr -d '\r' || true)"
  [ -n "$still_up" ] || fail "Back closed the app rather than the dialog in round $round"
  case "|$new|" in
    *"|$opener|"*)
      restored=$((restored + 1))
      if [ "$animation_scale" -eq 0 ]; then
        restored_scale_0=$((restored_scale_0 + 1))
      else
        restored_scale_1=$((restored_scale_1 + 1))
      fi
      echo "  round $round: focus returned to \"$opener\""
      ;;
    *)
      lost=$((lost + 1))
      if [ "$animation_scale" -eq 0 ]; then
        lost_scale_0=$((lost_scale_0 + 1))
      else
        lost_scale_1=$((lost_scale_1 + 1))
      fi
      echo "  round $round: focus did NOT return to \"$opener\""
      ;;
  esac
done

echo "focus returned in $restored of $((restored + lost)) dismissals"
echo "animation scale 0: $restored_scale_0 restored, $lost_scale_0 lost"
echo "animation scale 1: $restored_scale_1 restored, $lost_scale_1 lost"
# Asserted rather than warned about, since #463 made it work: run
# 35100769638 announced "Review email address" on dismissal. A run that does
# not is a regression in `Dialog`'s `restoreFocusTo`, not an open question.
if [ "$DIALOG_ROUNDS" -le 1 ]; then
  [ "$lost" -eq 0 ] || fail "dismissing the dialog did not announce \"$opener\", so focus did not return to it"
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

echo "ok"
