#!/usr/bin/env bash
set -euo pipefail

bundle_id=dev.hozo.threenativeprobe
process_name=HozoThreeNativeProbe
device_name="${IOS_DEVICE_NAME:-iPhone 17}"
root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/ios/build/Build/Products/Release-iphonesimulator/${process_name}.app"
artifacts="${1:-$root/artifacts-ios}"
events_name=hozo-three-native-events.json

mkdir -p "$artifacts"
[ -d "$app" ] || { echo "::error::missing iOS app at $app"; exit 1; }
[ -s "$app/main.jsbundle" ] || { echo '::error::release app has no bundled JavaScript'; exit 1; }

diagnose() {
  echo '--- persisted probe events ---'
  cat "$artifacts/events.json" 2>/dev/null || true
  echo '--- iOS application log ---'
  tail -n 300 "$artifacts/system.log" 2>/dev/null || true
}

fail() {
  echo "::error::$1"
  diagnose
  exit 1
}

cleanup() {
  if [ -n "${log_pid:-}" ]; then
    kill "$log_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

udid="$(xcrun simctl list devices available \
  | grep -E "^[[:space:]]+${device_name} \(" \
  | head -1 \
  | sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/')"
[ -n "$udid" ] || { xcrun simctl list devices available; exit 1; }
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b
xcrun simctl uninstall "$udid" "$bundle_id" 2>/dev/null || true
xcrun simctl install "$udid" "$app"
xcrun simctl spawn "$udid" log stream \
  --style compact \
  --level debug \
  --predicate "process == '$process_name'" \
  >"$artifacts/system.log" 2>&1 &
log_pid=$!

data_container() {
  xcrun simctl get_app_container "$udid" "$bundle_id" data
}

copy_events() {
  local source
  source="$(data_container)/Documents/$events_name"
  [ -s "$source" ] || return 1
  cp "$source" "$artifacts/events.json"
}

wait_for_event() {
  local wanted="$1"
  for _ in $(seq 1 90); do
    if copy_events && grep -q "\"event\": \"$wanted\"" "$artifacts/events.json"; then
      return 0
    fi
    sleep 1
  done
  fail "iOS Native GPU probe did not emit $wanted"
}

xcrun simctl launch "$udid" "$bundle_id"
wait_for_event first_frame
xcrun simctl io "$udid" screenshot "$artifacts/first-frame.png" >/dev/null
node "$root/../native-demo/scripts/screen-colours.mjs" "$artifacts/first-frame.png" 8

# Foregrounding Settings leaves the probe process alive while producing the
# ordinary UIKit background transition. Relaunching the probe then measures
# whether Expo GL resumes and renders with the same context.
xcrun simctl launch "$udid" com.apple.Preferences >/dev/null
wait_for_event app_backgrounded
sleep 2
xcrun simctl launch "$udid" "$bundle_id" >/dev/null
wait_for_event frame_after_resume
wait_for_event renderer_unmounted
xcrun simctl io "$udid" screenshot "$artifacts/completed.png" >/dev/null
copy_events

node "$root/scripts/collect-ios-report.mjs" \
  "$artifacts/events.json" \
  "$app" \
  "$artifacts/report.json"

echo 'Expo GL iOS Simulator lifecycle probe passed'
