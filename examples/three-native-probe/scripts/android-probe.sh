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
adb shell input tap "$surface_x" "$surface_y"

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
if grep -q 'Decorative GPU cube sentinel' "$artifacts/accessibility.xml"; then
  echo 'decorative GPU content reached the Android accessibility tree' >&2
  exit 1
fi
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

node "$root/scripts/collect-report.mjs" "$artifacts/logcat.txt" "$apk" "$artifacts/report.json"
