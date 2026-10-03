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
driver_service="$engine/.AccessibilityActionService"

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

node_is_focused_by_id() {
  node --eval '
    const fs = require("node:fs")
    const [file, wanted] = process.argv.slice(1)
    const xml = fs.readFileSync(file, "utf8")
    for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
      if (node[0].includes(`resource-id="${wanted}"`) && node[0].includes(`focused="true"`)) {
        process.exit(0)
      }
    }
    process.exit(1)
  ' "$1" "$2"
}

node_is_focused_by_description() {
  node --eval '
    const fs = require("node:fs")
    const [file, wanted] = process.argv.slice(1)
    const xml = fs.readFileSync(file, "utf8")
    for (const node of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
      if (node[0].includes(`content-desc="${wanted}"`) && node[0].includes(`focused="true"`)) {
        process.exit(0)
      }
    }
    process.exit(1)
  ' "$1" "$2"
}

# Canvas interactions exercise their real semantic or coordinate paths. The
# corpus buttons well inside the content area use an explicit touchscreen
# source; the status-bar-adjacent entry control uses keyboard activation.
tap_test_id() {
  local test_id="$1" file="tap-${1}.xml" left top right bottom
  dump "$file"
  read -r left top right bottom <<< "$(bounds_of "$file" "$test_id")" ||
    fail "could not find harness control $test_id"
  adb shell input touchscreen tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
}

activate_test_id() {
  local test_id="$1" file="focus-${1}.xml"
  for _ in $(seq 1 20); do
    adb shell input keyevent KEYCODE_TAB
    sleep 1
    dump "$file"
    if node_is_focused_by_id "$file" "$test_id"; then
      adb shell input keyevent KEYCODE_ENTER
      return 0
    fi
  done
  fail "could not keyboard-focus $test_id"
}

activate_description() {
  local description="$1" file="focus-description.xml"
  for _ in $(seq 1 20); do
    adb shell input keyevent KEYCODE_TAB
    sleep 1
    dump "$file"
    if node_is_focused_by_description "$file" "$description"; then
      adb shell input keyevent KEYCODE_ENTER
      return 0
    fi
  done
  fail "could not keyboard-focus $description"
}

tree_has_text() {
  node --eval '
    const fs = require("node:fs")
    const [file, wanted] = process.argv.slice(1)
    const xml = fs.readFileSync(file, "utf8")
    process.exit(xml.includes(`text="${wanted}"`) ? 0 : 1)
  ' "$1" "$2"
}

wait_for_text() {
  local file="$1" wanted="$2"
  for _ in $(seq 1 10); do
    dump "$file"
    tree_has_text "$file" "$wanted" && return 0
    sleep 1
  done
  return 1
}

# Which scene the Three surface itself says it is drawing, read from its
# accessibility label (`${definition.id} Three scene` in ThreeCorpusBench).
#
# Printed when a scene is not selected, because two different defects fail
# that check. In one, the bench never advanced. In the other -- seen in run
# 37076464722 -- the surface had moved on to wireframe-cad and was drawing it,
# while the `scene:` text above it still said flat-labelled-diagram. Only this
# label tells them apart from the log.
three_surface_scene() {
  node --eval '
    const xml = require("node:fs").readFileSync(process.argv[1], "utf8")
    const found = /content-desc="([^"]+) Three scene"/.exec(xml)
    console.log(found ? found[1] : "(no Three surface in the tree)")
  ' "$1"
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

# Run the exact version-pinned Three corpus through the Native entry of
# ThreeCanvas. That entry projects with the portable renderer and draws with
# the real Skia host already under test above; it is deliberately not evidence
# for the separate Native GPU investigation in #596.
dump canvas-before-three.xml
# This first control sits directly below Android's status-bar inset. Its UI
# tree bounds are correct, but API 36 can still route an injected coordinate
# at that edge to System UI. Keyboard activation avoids that platform edge;
# later corpus controls are safely inside the content area and use touch.
activate_test_id show-three-corpus
sleep 2

# In the order of `SCENE_CORPUS_SCENES` in `@hozo/three/conformance-scenes`,
# which is the order Next walks. A scene added there has to be added here too:
# product-viewer-gltf was added on 2026-09-30 without it, and every run after
# that reached gltf-pbr's place and found product-viewer-gltf in it.
three_ids=(flat-labelled-diagram wireframe-cad points-and-sprite instancing-and-morph)
three_labels=('Input node' 'Wireframe assembly' 'Point cloud' 'Morphed instances')
for index in 0 1 2 3; do
  id="${three_ids[$index]}"
  label="${three_labels[$index]}"
  xml="three-native-${id}.xml"
  wait_for_text "$xml" "scene: $id" ||
    fail "Three corpus did not select $id (the surface reports $(three_surface_scene "$xml"))"
  tree_has_text "$xml" 'diagnostics: none' || fail "$id produced an unexpected diagnostic"
  activate_description "$label"
  wait_for_text "$xml" "activated: $label" || fail "$id did not activate $label"
  adb exec-out screencap -p > "three-native-${id}.png" 2>/dev/null || true
  echo "Three Native host -> $id -> $label"
  tap_test_id three-corpus-next
  sleep 2
done

# The animated, textured product viewer. Under the portable renderer it is a
# diagnostic rather than a useful scene -- its materials are past the portable
# boundary, as `scene-conformance.json`'s portableObservation records -- so it
# is checked for that and has nothing to activate.
wait_for_text three-native-product-viewer-gltf.xml 'scene: product-viewer-gltf' ||
  fail "Three corpus did not select product-viewer-gltf (the surface reports $(three_surface_scene three-native-product-viewer-gltf.xml))"
wait_for_text three-native-product-viewer-gltf.xml 'diagnostics: UNSUPPORTED_MATERIAL' ||
  fail 'the product viewer did not stop at the documented portable material boundary'
adb exec-out screencap -p > three-native-product-viewer-gltf.png 2>/dev/null || true
echo 'Three Native host -> product-viewer-gltf -> UNSUPPORTED_MATERIAL'
tap_test_id three-corpus-next
sleep 2

wait_for_text three-native-gltf-pbr.xml 'scene: gltf-pbr' ||
  fail "Three corpus did not select gltf-pbr (the surface reports $(three_surface_scene three-native-gltf-pbr.xml))"
wait_for_text three-native-gltf-pbr.xml 'diagnostics: UNSUPPORTED_MATERIAL' ||
  fail 'glTF/PBR did not stop at the documented portable material boundary'
adb exec-out screencap -p > three-native-gltf-pbr.png 2>/dev/null || true
node --eval '
  const fs = require("node:fs")
  const useful = [
    "flat-labelled-diagram",
    "wireframe-cad",
    "points-and-sprite",
    "instancing-and-morph",
  ].map((id) => ({ id, status: "useful", semanticControl: true, activated: true }))
  fs.writeFileSync("three-native-corpus.json", `${JSON.stringify({
    family: "native-host",
    host: "React Native Android / Skia",
    fixtures: [...useful, ...["product-viewer-gltf", "gltf-pbr"].map((id) => ({
      id,
      status: "diagnostic",
      diagnostics: ["UNSUPPORTED_MATERIAL"],
      semanticControl: false,
      activated: false,
    }))],
  }, null, 2)}\n`)
'
echo 'Three Native host corpus: 4 useful, 2 explicit diagnostics, 0 failed'

# Restore the original surface before the existing TalkBack pass so the new
# corpus cannot weaken or accidentally replace Canvas's accessibility check.
tap_test_id three-corpus-back
sleep 2
dump canvas-after-three.xml
bounds_of canvas-after-three.xml canvas-surface >/dev/null ||
  fail 'Canvas surface did not return after the Three corpus'

# React Native delivers mouse hover through offsetX/offsetY, whereas touch
# above used locationX/locationY. Do this after all harness navigation: the
# emulator's external mouse retains global pointer/focus state and can make a
# later touchscreen or Enter activation nondeterministic even when Android's
# UI tree reports the expected focused node.
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
# Android 13+ protects sideloaded accessibility services behind a restricted
# setting. This APK is a CI-only driver installed by adb, so grant that app-op
# explicitly before asking AccessibilityManager to bind it.
adb shell appops set "$engine" ACCESS_RESTRICTED_SETTINGS allow 2>/dev/null || true
adb logcat -c
bound=
for attempt in 1 2; do
  adb shell settings put secure enabled_accessibility_services "$talkback_service:$driver_service"
  adb shell settings put secure accessibility_enabled 1
  for _ in $(seq 1 30); do
    services="$(adb shell dumpsys accessibility | tr -d '\r')"
    if printf '%s' "$services" | grep -q TalkBackService &&
      printf '%s' "$services" | grep -q AccessibilityActionService; then
      bound=1
      break 2
    fi
    sleep 1
  done
  echo "TalkBack and the action driver did not both bind on attempt $attempt; toggling the services"
  adb shell settings put secure accessibility_enabled 0
  adb shell settings delete secure enabled_accessibility_services >/dev/null 2>&1 || true
  adb shell am force-stop "$talkback" >/dev/null 2>&1 || true
  sleep 2
done
[ -n "$bound" ] || fail "TalkBack and the action driver did not bind after two attempts"
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

# Finish on a known semantic control. The peer service observes the same
# accessibility-focus event TalkBack uses and invokes Android's ACTION_CLICK
# on that event's source. ADB cannot inject a trusted TalkBack double-tap into
# this headless image, but this still crosses the platform accessibility
# action boundary rather than calling the React handler directly.
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
adb logcat -d -v raw -s HozoA11yDriver:I | grep -q 'activated January revenue returned true' ||
  fail 'Android rejected ACTION_CLICK for the Canvas Rect control'
adb logcat -d -v raw | grep -q '\[hozo-canvas\] pressed rect' ||
  fail 'ACTION_CLICK did not reach the Canvas Rect handler'
echo 'TalkBack focus -> Android accessibility ACTION_CLICK -> rect'

adb exec-out screencap -p > ./canvas-android.png 2>/dev/null || true
echo 'Canvas touch, pointer and TalkBack acceptance passed'
