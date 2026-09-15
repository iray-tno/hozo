#!/usr/bin/env bash
# What TalkBack says about the acceptance screen, read off a running
# emulator.
#
# `android-smoke.sh` reads the accessibility tree, which is what TalkBack
# reads *from*. This reads what it says: `speech-log/` is a text-to-speech
# engine that logs every utterance under the `HozoSpeech` tag, it is made
# the default engine, TalkBack is switched on through secure settings, and
# its "next item" command is sent until it stops finding anything new.
#
# Needs an image that ships TalkBack -- API 36 does, API 34 does not -- and
# the release APK plus the speech-log APK already built.
#
# Writes `talkback-speech.json` (every step and what it said) and a
# screenshot at the start and the end. Fails when TalkBack said fewer than
# MIN_SPOKEN distinct things, because a silent reader is the failure a green
# run hides.

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

fail() {
  echo "::error::$*"
  adb exec-out screencap -p > ./talkback-failed.png 2>/dev/null || true
  echo '--- logcat (tail) ---'
  adb logcat -d -v brief | tail -150 || true
  exit 1
}

# Every utterance so far, one per line, in order.
spoken() {
  adb logcat -d -v raw -s HozoSpeech:I | tr -d '\r' | grep -v '^--------- ' || true
}

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
echo "default engine: $(adb shell settings get secure tts_default_synth | tr -d '\r')"

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
sleep 8
if ! adb shell dumpsys accessibility | tr -d '\r' | grep -q 'TalkBackService'; then
  fail "TalkBack is not bound after enabling it"
fi
adb exec-out screencap -p > ./talkback-start.png 2>/dev/null || true
adb shell uiautomator dump /sdcard/talkback.xml > /dev/null 2>&1 && adb pull /sdcard/talkback.xml ./talkback-start.xml > /dev/null 2>&1 || true

initial="$(spoken)"
echo "said on start:"
printf '%s\n' "$initial" | sed 's/^/  /'
if [ -z "$initial" ]; then
  echo "::warning::TalkBack said nothing on start; the engine may not be in use"
fi

# One step of "next item", sent every way TalkBack might accept one: its
# keyboard shortcut (Alt+Right in the default keymap) from the default and
# the keyboard input source, a swipe right at two speeds, which touch
# exploration reads as the same command, and Tab, which moves input focus
# and TalkBack follows. Whichever makes TalkBack speak is kept for the rest
# of the run.
next_by_key() { adb shell input keycombination KEYCODE_ALT_LEFT KEYCODE_DPAD_RIGHT; }
next_by_keyboard() { adb shell input keyboard keycombination KEYCODE_ALT_LEFT KEYCODE_DPAD_RIGHT; }
next_by_tab() { adb shell input keyevent KEYCODE_TAB; }
next_by_swipe() {
  local size w h
  size="$(adb shell wm size | tr -d '\r' | grep -o '[0-9]*x[0-9]*' | tail -1)"
  w="${size%x*}"; h="${size#*x}"
  adb shell input swipe $((w / 4)) $((h / 2)) $((w * 3 / 4)) $((h / 2)) ${1:-120}
}
next_by_slow_swipe() { next_by_swipe 300; }

said_before="$(spoken | wc -l)"
method=
for candidate in key keyboard swipe slow_swipe tab; do
  "next_by_$candidate"
  sleep 3
  if [ "$(spoken | wc -l)" -gt "$said_before" ]; then method=$candidate; break; fi
  echo "next by $candidate: TalkBack said nothing"
done
[ -n "$method" ] || fail "nothing made TalkBack move: Alt+Right, a swipe and Tab were all silent"
echo "moving with: $method"

steps_file="$(mktemp)"
previous=
repeats=0
silent=0
for step in $(seq 1 "$MAX_STEPS"); do
  now="$(spoken | wc -l)"
  new="$(spoken | tail -n +$((said_before + 1)) | paste -sd '|' -)"
  said_before=$now
  printf '%s\t%s\n' "$step" "$new" >> "$steps_file"
  echo "  $step: ${new:-(silent)}"
  if [ -z "$new" ]; then
    silent=$((silent + 1))
    [ "$silent" -lt 5 ] || break
  else
    silent=0
    if [ "$new" = "$previous" ]; then
      repeats=$((repeats + 1))
      [ "$repeats" -lt 3 ] || break
    else
      repeats=0
    fi
    previous=$new
  fi
  "next_by_$method"
  sleep 2
done

adb exec-out screencap -p > ./talkback-end.png 2>/dev/null || true

node --eval '
  const fs = require("node:fs")
  const [steps, method, all] = process.argv.slice(1)
  const rows = fs.readFileSync(steps, "utf8").split("\n").filter(Boolean).map((line) => {
    const [step, said] = line.split("\t")
    return { step: Number(step), said: said ? said.split("|") : [] }
  })
  const log = { method, utterances: all.split("\n").filter(Boolean), steps: rows }
  fs.writeFileSync("talkback-speech.json", JSON.stringify(log, null, 2) + "\n")
' "$steps_file" "$method" "$(spoken)"

distinct=$(spoken | sort -u | grep -c . || true)
echo "TalkBack said $distinct distinct things"
[ "$distinct" -ge "$MIN_SPOKEN" ] || fail "TalkBack said only $distinct distinct things, so it did not read the screen"
echo "ok"
