#!/usr/bin/env bash
set -euo pipefail

package=dev.hozo.threenativeprobe
activity="${package}/.MainActivity"
root="$(cd "$(dirname "$0")/.." && pwd)"
apk="$root/android/app/build/outputs/apk/release/app-release.apk"
artifacts="${1:-$root/artifacts}"

mkdir -p "$artifacts"
test -f "$apk"
# A loaded emulator can put a System UI ANR dialog in front of a healthy app.
# The probe diagnoses its own process and logs, so another process's dialog is
# only noise that would make uiautomator inspect the wrong window.
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
adb install -r "$apk"
adb logcat -c
adb shell am force-stop "$package" || true
adb shell am start -W -n "$activity"

for _ in $(seq 1 90); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"first_frame"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done

# Exercise the real Android Activity lifecycle before accepting the frame
# sample. AppState alone is not evidence of GPU recovery: the fixture also
# requires R3F to render a frame after the Activity becomes active again.
adb shell input keyevent KEYCODE_HOME
for _ in $(seq 1 30); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"app_backgrounded"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done
grep -q '\[hozo-three-native\].*"event":"app_backgrounded"' "$artifacts/logcat.txt"
sleep 2
adb shell am start -W -n "$activity"
for _ in $(seq 1 45); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"frame_after_resume"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done
grep -q '\[hozo-three-native\].*"event":"app_resumed"' "$artifacts/logcat.txt"
grep -q '\[hozo-three-native\].*"event":"frame_after_resume"' "$artifacts/logcat.txt"

# The R3F Native event manager owns this touch. The scene does not unmount
# until the tap raycasts the cube, so a missing event cannot be hidden by a
# successful frame sample. Avoid uiautomator while the GPU surface is drawing
# continuously: this fixture centres both the Canvas and the cube, and its
# fixed Pixel 6 profile places that centre at 47.5% of the screen height.
screen_size="$(adb shell wm size | tr -d '\r' | grep -oE '[0-9]+x[0-9]+' | tail -1)"
screen_width="${screen_size%x*}"
screen_height="${screen_size#*x}"
surface_x=$((screen_width / 2))
surface_y=$((screen_height * 19 / 40))
touch_attempts=0
for attempt in $(seq 1 10); do
  touch_attempts=$attempt
  adb shell input tap "$surface_x" "$surface_y"
  sleep 1
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"object_activated".*"source":"canvas"' "$artifacts/logcat.txt"; then
    break
  fi
done
printf '%s\n' "$touch_attempts" > "$artifacts/touch-attempts.txt"
grep -q '\[hozo-three-native\].*"event":"object_activated".*"source":"canvas"' "$artifacts/logcat.txt"

for _ in $(seq 1 90); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"renderer_unmounted"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done

for _ in $(seq 1 6); do
  adb shell rm -f /sdcard/three-native-probe.xml >/dev/null 2>&1 || true
  adb shell uiautomator dump /sdcard/three-native-probe.xml >/dev/null 2>&1 || true
  if adb pull /sdcard/three-native-probe.xml "$artifacts/accessibility.xml" >/dev/null 2>&1 \
    && grep -q "package=\"$package\"" "$artifacts/accessibility.xml" \
    && grep -q 'probe-complete' "$artifacts/accessibility.xml"; then
    break
  fi
  sleep 3
done
adb exec-out screencap -p > "$artifacts/screenshot.png"
grep -q "package=\"$package\"" "$artifacts/accessibility.xml"
grep -q 'probe-complete' "$artifacts/accessibility.xml"
grep -q 'Labelled GPU cube' "$artifacts/accessibility.xml"
grep -q 'Inspect fallback cube data' "$artifacts/accessibility.xml"
# A hierarchy dump includes non-focusable native descendants that TalkBack
# filters while navigating. It is useful for proving that positive semantic
# endpoints exist, but not for proving that decorative content is silent.
# The following TalkBack pass makes that negative assertion from actual TTS
# output instead.
read -r control_x control_y < <(
  node "$root/scripts/control-centre.mjs" \
    "$artifacts/accessibility.xml" \
    'activate-measured-cube'
)
adb shell input tap "$control_x" "$control_y"

for _ in $(seq 1 10); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"source":"semantic-control"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done

node "$root/scripts/collect-report.mjs" \
  "$artifacts/logcat.txt" \
  "$apk" \
  "$artifacts/touch-attempts.txt" \
  "$artifacts/report.json"
