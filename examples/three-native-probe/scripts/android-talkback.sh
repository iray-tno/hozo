#!/usr/bin/env bash
set -euo pipefail

package=dev.hozo.threenativeprobe
root="$(cd "$(dirname "$0")/.." && pwd)"
artifacts="${1:-$root/artifacts}"
speech_apk="$root/../native-demo/speech-log/build/outputs/apk/debug/speech-log-debug.apk"
engine=dev.hozo.speechlog
talkback=com.google.android.marvin.talkback
talkback_service="$talkback/com.google.android.marvin.talkback.TalkBackService"

spoken() {
  adb logcat -d -v raw -s HozoSpeech:I | tr -d '\r' | grep -v '^--------- ' || true
}

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

[ -f "$speech_apk" ] || speech_apk="$(
  find "$root/../native-demo/speech-log/build/outputs/apk/debug" -name '*.apk' -print -quit
)"
test -f "$speech_apk"
test -n "$(adb shell pidof "$package" | tr -d '\r')"
adb install -r "$speech_apk"
adb shell settings put secure tts_default_synth "$engine"
adb shell pm grant "$talkback" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb logcat -c
adb shell settings put secure enabled_accessibility_services "$talkback_service"
adb shell settings put secure accessibility_enabled 1

for _ in $(seq 1 30); do
  if adb shell dumpsys accessibility | tr -d '\r' | grep -q 'TalkBackService'; then break; fi
  sleep 1
done
adb shell dumpsys accessibility | tr -d '\r' | grep -q 'TalkBackService'

for _ in $(seq 1 20); do
  [ -z "$(spoken)" ] || break
  sleep 1
done
settle

# Hardware Tab is the supported deterministic driver on this image. The
# labelled image is explicitly focusable, while fallback exposes its own
# button. The decorative subtree must remain absent from every utterance.
for _ in $(seq 1 12); do
  adb shell input keyevent KEYCODE_TAB
  settle
done

spoken > "$artifacts/talkback.txt"
adb exec-out screencap -p > "$artifacts/talkback.png" 2>/dev/null || true
grep -q 'Labelled GPU cube' "$artifacts/talkback.txt"
grep -q 'Inspect fallback cube data' "$artifacts/talkback.txt"
if grep -q 'Decorative GPU cube sentinel' "$artifacts/talkback.txt"; then
  echo 'decorative GPU content was announced by TalkBack' >&2
  exit 1
fi
