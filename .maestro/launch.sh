#!/usr/bin/env bash
# Starts ECHO in Expo Go from Metro (127.0.0.1:8081) and waits for Expo Go to open it.
#
#   .maestro/launch.sh fresh   clear Expo Go's data first (a first install), dismiss its first-run tip
#   .maestro/launch.sh kill    force-stop first, so ECHO starts cold
#   .maestro/launch.sh         reuse the running process
#
# Metro must already be running with the stand-in microphone:
#   ECHO_E2E=1 npx expo start --clear --port 8081
#
# Run this, not Maestro, to start the app. On a 2 GB emulator a cold start of Expo Go is killed for
# "start timeout" if Maestro is dumping the screen meanwhile, and it sometimes stalls on its
# launcher screen, so this retries until the experience has focus.
set -u
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
HERE="$(cd "$(dirname "$0")" && pwd)"

"$ADB" shell pkill -9 -f uiautomator >/dev/null 2>&1
"$ADB" shell am force-stop dev.mobile.maestro >/dev/null 2>&1
"$ADB" shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1
"$ADB" reverse tcp:8081 tcp:8081 >/dev/null 2>&1
if [ "${1:-}" = "fresh" ]; then "$ADB" shell pm clear host.exp.exponent >/dev/null; fi
if [ "${1:-}" = "fresh" ] || [ "${1:-}" = "kill" ]; then "$ADB" shell am force-stop host.exp.exponent; fi

for attempt in 1 2 3 4; do
  "$ADB" shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 >/dev/null
  for _ in 1 2 3 4 5 6 7 8; do
    sleep 4
    if "$ADB" shell dumpsys window | grep mCurrentFocus | grep -q "ExperienceActivity"; then
      sleep 18
      if [ "${1:-}" = "fresh" ] && "$HERE/ui.sh" 40 | grep -q "Continue"; then
        # Expo Go's first-run developer-menu tip: Continue, then close the menu it opens.
        "$ADB" shell input tap 540 2167
        sleep 2
        "$ADB" shell input tap 970 1080
        sleep 2
      fi
      echo "launched (attempt $attempt)"
      exit 0
    fi
  done
done
echo "launch: Expo Go never opened ECHO" >&2
exit 1
