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
  if grep -q '\[hozo-three-native\].*"event":"first_frame"' "$artifacts/logcat.txt" \
    && grep -q '\[hozo-three-native\].*"event":"lifecycle_listener_ready"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done
grep -q '\[hozo-three-native\].*"event":"first_frame"' "$artifacts/logcat.txt"
grep -q '\[hozo-three-native\].*"event":"lifecycle_listener_ready"' "$artifacts/logcat.txt"

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

for _ in $(seq 1 30); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"steady_sample"' "$artifacts/logcat.txt"; then
    break
  fi
  sleep 1
done
grep -q '\[hozo-three-native\].*"event":"steady_sample"' "$artifacts/logcat.txt"

# The public wrapper, rather than a probe-owned sibling button, must expose
# both controls. Hardware focus + Enter exercises semantic activation without
# letting the transparent accessibility targets steal pointer hits from R3F.
focus_and_activate() {
  local resource_id="$1"
  local centre
  for _ in $(seq 1 16); do
    adb shell input keyevent KEYCODE_TAB
    adb shell rm -f /sdcard/three-native-public.xml >/dev/null 2>&1 || true
    adb shell uiautomator dump /sdcard/three-native-public.xml >/dev/null 2>&1 || true
    adb pull /sdcard/three-native-public.xml "$artifacts/public-accessibility.xml" >/dev/null 2>&1
    if [ "$(node "$root/scripts/control-centre.mjs" "$artifacts/public-accessibility.xml" "$resource_id" --focused)" = true ]; then
      adb shell input keyevent KEYCODE_ENTER
      return 0
    fi
  done
  # Android's hardware-focus cursor can disappear when the previous semantic
  # control unmounts with its GPU scene. The target is still a real native
  # button, so fall back to tapping that button's measured accessibility bounds
  # rather than failing on focus-driver state unrelated to its activation.
  centre="$(node "$root/scripts/control-centre.mjs" "$artifacts/public-accessibility.xml" "$resource_id")"
  read -r centre_x centre_y <<< "$centre"
  adb shell input tap "$centre_x" "$centre_y"
}

adb shell uiautomator dump /sdcard/three-native-public.xml >/dev/null 2>&1
adb pull /sdcard/three-native-public.xml "$artifacts/public-accessibility.xml" >/dev/null 2>&1
grep -q 'resource-id="activate-measured-cube"' "$artifacts/public-accessibility.xml"
grep -q 'content-desc="Activate measured cube"' "$artifacts/public-accessibility.xml"
grep -q 'resource-id="open-measured-cube"' "$artifacts/public-accessibility.xml"
grep -q 'content-desc="Open measured cube details"' "$artifacts/public-accessibility.xml"

focus_and_activate 'activate-measured-cube'
for _ in $(seq 1 10); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"source":"semantic-control"' "$artifacts/logcat.txt"; then break; fi
  sleep 1
done
grep -q '\[hozo-three-native\].*"source":"semantic-control"' "$artifacts/logcat.txt"

focus_and_activate 'open-measured-cube'
for _ in $(seq 1 10); do
  adb logcat -d -v brief > "$artifacts/logcat.txt"
  if grep -q '\[hozo-three-native\].*"event":"navigation_activated"' "$artifacts/logcat.txt"; then break; fi
  sleep 1
done
grep -q '\[hozo-three-native\].*"event":"navigation_activated".*"href":"/cubes/measured".*"replace":true' "$artifacts/logcat.txt"

# The public Native host now runs the same five version-pinned scenes as the
# browser GPU report. Each scene must draw and expose at least one semantic
# object; Android additionally activates that object through the actual native
# control before the probe advances.
for fixture_id in \
  flat-labelled-diagram \
  wireframe-cad \
  points-and-sprite \
  instancing-and-morph \
  gltf-pbr; do
  resource_id="corpus-$fixture_id"
  # Repeated native GL teardown can delay the final async glTF fixture on a
  # loaded hosted emulator even though the application remains healthy.
  for _ in $(seq 1 60); do
    adb shell rm -f /sdcard/three-native-corpus.xml >/dev/null 2>&1 || true
    adb shell uiautomator dump /sdcard/three-native-corpus.xml >/dev/null 2>&1 || true
    adb pull /sdcard/three-native-corpus.xml "$artifacts/corpus-accessibility.xml" >/dev/null 2>&1
    if grep -q "resource-id=\"$resource_id\"" "$artifacts/corpus-accessibility.xml"; then
      break
    fi
    sleep 1
  done
  grep -q "resource-id=\"$resource_id\"" "$artifacts/corpus-accessibility.xml"
  focus_and_activate "$resource_id"
  for _ in $(seq 1 15); do
    adb logcat -d -v brief > "$artifacts/logcat.txt"
    if grep -q "\[hozo-three-native\].*\"event\":\"scene_corpus_fixture\".*\"fixtureId\":\"$fixture_id\".*\"status\":\"useful\".*\"activation\":\"measured\"" "$artifacts/logcat.txt"; then
      break
    fi
    sleep 1
  done
  grep -q "\[hozo-three-native\].*\"event\":\"scene_corpus_fixture\".*\"fixtureId\":\"$fixture_id\".*\"status\":\"useful\".*\"activation\":\"measured\"" "$artifacts/logcat.txt"
done

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

node "$root/scripts/collect-report.mjs" \
  "$artifacts/logcat.txt" \
  "$apk" \
  "$artifacts/touch-attempts.txt" \
  "$artifacts/report.json"
