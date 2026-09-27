#!/usr/bin/env bash
set -euo pipefail

package=dev.hozo.threenativeprobe
activity="${package}/.MainActivity"
root="$(cd "$(dirname "$0")/.." && pwd)"
apk="$root/android/app/build/outputs/apk/release/app-release.apk"
artifacts="${1:-$root/artifacts}"

mkdir -p "$artifacts"
test -f "$apk"
adb install -r "$apk"
adb logcat -c
adb shell am force-stop "$package" || true
adb shell am start -W -n "$activity"

for _ in $(seq 1 90); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"renderer_unmounted"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done

adb logcat -d -v brief > "$artifacts/logcat.txt"
adb shell uiautomator dump /sdcard/three-native-probe.xml >/dev/null
adb pull /sdcard/three-native-probe.xml "$artifacts/accessibility.xml" >/dev/null
adb exec-out screencap -p > "$artifacts/screenshot.png"
grep -q 'probe-complete' "$artifacts/accessibility.xml"
read -r control_x control_y < <(
  node "$root/scripts/control-centre.mjs" \
    "$artifacts/accessibility.xml" \
    "$package:id/activate-measured-cube"
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
