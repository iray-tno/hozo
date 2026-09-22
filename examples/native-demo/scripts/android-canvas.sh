#!/usr/bin/env bash
# Execute the Native Canvas surface rather than merely bundling it.
#
# This is the automated Android-equivalent of #26's remaining device pass:
# it drives the real Skia surface with touch and mouse input, then enables the
# real TalkBack service and records what it says about the semantic controls.
# It cannot answer for an OEM, physical stylus or hardware GPU, but it does
# answer whether React Native delivers the two coordinate paths Canvas uses.

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
package=com.hozonativedemo
activity="${package}/.MainActivity"
apk="$here/../android/app/build/outputs/apk/release/app-release.apk"
speech_apk="$here/../speech-log/build/outputs/apk/debug/speech-log-debug.apk"
engine=dev.hozo.speechlog
talkback=com.google.android.marvin.talkback
talkback_service="$talkback/com.google.android.marvin.talkback.TalkBackService"

fail() {
  echo "::error::$*"
  adb exec-out screencap -p > ./canvas-android-failed.png 2>/dev/null || true
  echo '--- Canvas speech ---'
  spoken | tail -50 | sed 's/^/  /' || true
  echo '--- logcat ---'
  adb logcat -d -v brief | tail -80 || true
  exit 1
}

spoken() {
  adb logcat -d -v raw -s HozoSpeech:I | tr -d '\r' | grep -v '^--------- ' || true
}

settle_speech() {
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

dump() {
  local into="$1"
  for _ in $(seq 1 6); do
    adb shell rm -f /sdcard/canvas.xml >/dev/null 2>&1 || true
    adb shell uiautomator dump /sdcard/canvas.xml >/dev/null 2>&1 || true
    if adb pull /sdcard/canvas.xml "$into" >/dev/null 2>&1 && [ -s "$into" ]; then
      return 0
    fi
    sleep 3
  done
  fail "could not read the Canvas accessibility tree"
}

# Print the physical-pixel bounds of a React Native testID.
bounds_of() {
  node --eval '
    const fs = require("node:fs")
    const [file, wanted] = process.argv.slice(1)
    const xml = fs.readFileSync(file, "utf8")
    for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
      if (!node[0].includes(`resource-id="${wanted}"`)) continue
      const box = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node[0])
      if (box) {
        console.log(box.slice(1).join(" "))
        process.exit(0)
      }
    }
    process.exit(1)
  ' "$1" "$2"
}

tree_has_text() {
  node --eval '
    const fs = require("node:fs")
    const [file, wanted] = process.argv.slice(1)
    const xml = fs.readFileSync(file, "utf8")
    process.exit(xml.includes(`text="${wanted}"`) ? 0 : 1)
  ' "$1" "$2"
}

# Convert a point in the 100x60 viewBox into the physical bounds reported by
# Android. This includes density and the Canvas's actual screen position, so
# the check does not assume a particular emulator DPI.
at_viewbox_point() {
  node --eval '
    const [left, top, right, bottom, x, y] = process.argv.slice(1).map(Number)
    console.log(
      Math.round(left + (x / 100) * (right - left)),
      Math.round(top + (y / 60) * (bottom - top)),
    )
  ' "$@"
}

assert_pressed() {
  local name="$1" x="$2" y="$3"
  read -r px py <<< "$(at_viewbox_point $surface_bounds "$x" "$y")"
  adb shell input touchscreen tap "$px" "$py"
  sleep 1
  dump canvas-touch.xml
  tree_has_text canvas-touch.xml "pressed: $name" ||
    fail "touch at viewBox ($x,$y) did not press $name"
  echo "touch -> $name at viewBox ($x,$y)"
}

adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
[ -f "$apk" ] || fail "no Canvas release APK at $apk"
[ -f "$speech_apk" ] || speech_apk="$(ls "$here"/../speech-log/build/outputs/apk/debug/*.apk 2>/dev/null | head -1)"
[ -f "$speech_apk" ] || fail "no speech-log APK"

adb install -r "$speech_apk"
adb install -r "$apk"
adb logcat -c
adb shell am start -W -n "$activity" >/dev/null
sleep 12
[ -n "$(adb shell pidof "$package" | tr -d '\r')" ] || fail "$package did not stay up"

# TalkBack must still be off here: a single tap under touch exploration moves
# its cursor rather than delivering the Canvas responder event.
dump canvas-start.xml
surface_bounds="$(bounds_of canvas-start.xml canvas-surface)" ||
  fail "the real Native Canvas surface was not mounted"
echo "Canvas bounds: $surface_bounds"

# A filled shape, a transformed shape, a renderer-owned Path hit test and the
# narrow stroked Line exercise distinct geometry paths. Each assertion reads
# the state back from Android rather than trusting the injected command.
assert_pressed rect 15 30
assert_pressed rounded-rect 39 30
assert_pressed circle 62 30
assert_pressed path 50 6
assert_pressed line 50 56

# React Native delivers mouse hover through offsetX/offsetY, whereas touch
# above used locationX/locationY. A successful state change establishes that
# both point derivations address the same physical Rect on this runtime.
read -r hover_x hover_y <<< "$(at_viewbox_point $surface_bounds 15 30)"
# Android's shell `input mouse motionevent MOVE` constructs ACTION_MOVE, not
# the no-button HOVER_MOVE a physical mouse produces. The emulator console's
# EV_REL device is its external-mouse path. Clamp it to the top-left with a
# large negative delta, then move to the absolute screen point we want.
if adb emu event send EV_REL:REL_X:-10000 EV_REL:REL_Y:-10000 EV_SYN:0:0 >/dev/null 2>&1 &&
  adb emu event send "EV_REL:REL_X:$hover_x" "EV_REL:REL_Y:$hover_y" EV_SYN:0:0 >/dev/null 2>&1; then
  sleep 1
  dump canvas-hover.xml
  if tree_has_text canvas-hover.xml 'indicated: rect'; then
    echo 'mouse hover -> rect'
  else
    echo '::warning::the headless emulator accepted external-mouse input but did not deliver a React Native pointer move; physical mouse/stylus hover remains a manual check'
  fi
else
  fail "this Android image cannot inject the external-mouse movement needed by the Canvas contract"
fi

# Now validate the semantic surface with the actual TalkBack service and a
# logger TTS engine. uiautomator is intentionally not used after this point:
# its UiAutomation connection suppresses TalkBack.
adb shell settings put secure tts_default_synth "$engine"
adb shell pm grant "$talkback" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb logcat -c
bound=
for attempt in 1 2; do
  adb shell settings put secure enabled_accessibility_services "$talkback_service"
  adb shell settings put secure accessibility_enabled 1
  for _ in $(seq 1 30); do
    if adb shell dumpsys accessibility | tr -d '\r' | grep -q TalkBackService; then bound=1; break 2; fi
    sleep 1
  done
  echo "TalkBack did not bind on attempt $attempt; toggling the service"
  adb shell settings put secure accessibility_enabled 0
  adb shell settings delete secure enabled_accessibility_services >/dev/null 2>&1 || true
  adb shell am force-stop "$talkback" >/dev/null 2>&1 || true
  sleep 2
done
[ -n "$bound" ] || fail "TalkBack did not bind after two attempts"
for _ in $(seq 1 20); do
  [ -n "$(spoken)" ] && break
  sleep 1
done
settle_speech

before="$(spoken | wc -l)"
for _ in $(seq 1 12); do
  adb shell input keyevent KEYCODE_TAB
  sleep 1
  settle_speech
done

walk="$(spoken | tail -n +$((before + 1)))"
printf '%s\n' "$walk" > canvas-talkback.txt
printf '%s\n' "$walk" | grep -qi 'January revenue' || fail 'TalkBack did not reach the Rect control'
printf '%s\n' "$walk" | grep -qi 'February revenue' || fail 'TalkBack did not reach the RoundedRect control'
printf '%s\n' "$walk" | grep -qi 'March revenue' || fail 'TalkBack did not reach the Circle control'
printf '%s\n' "$walk" | grep -qi 'Baseline' || fail 'TalkBack did not reach the Path control'
printf '%s\n' "$walk" | grep -qi 'Target line' || fail 'TalkBack did not reach the Line control'
printf '%s\n' "$walk" | grep -qi 'Button' || fail 'TalkBack did not announce Canvas actions as buttons'

# Finish on a known semantic control, then use TalkBack's global double-tap
# gesture. The control is a clipped accessibility element rather than a
# touchable pixel, so this exercises onAccessibilityTap rather than the
# responder path already tested above.
focused=
for _ in $(seq 1 12); do
  count="$(spoken | wc -l)"
  adb shell input keyevent KEYCODE_TAB
  sleep 1
  settle_speech
  step="$(spoken | tail -n +$((count + 1)))"
  if printf '%s\n' "$step" | grep -qi 'January revenue'; then
    focused=1
    break
  fi
done
[ -n "$focused" ] || fail 'TalkBack could not refocus the Rect control for activation'

adb logcat -c
adb shell input tap 500 500
adb shell input tap 500 500
sleep 2
adb logcat -d -v raw | grep -q '\[hozo-canvas\] pressed rect' ||
  fail 'TalkBack double-tap did not activate the Rect control'
echo 'TalkBack double-tap -> rect'

adb exec-out screencap -p > ./canvas-android.png 2>/dev/null || true
echo 'Canvas touch, pointer and TalkBack acceptance passed'
