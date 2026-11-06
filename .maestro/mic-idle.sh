#!/usr/bin/env bash
# "Nothing starts the microphone without a touch": watches the system's own record of microphone
# starts while nobody touches the app, and says whether any appeared.
#
#   .maestro/mic-idle.sh <label> [seconds]      default 90
#
# Metro must run WITHOUT ECHO_E2E, so ECHO uses the real expo-audio: the end-to-end stand-in never
# opens an AudioRecord, and dumpsys audio cannot see it. Leave the app on the screen being tested
# and do not touch it until this prints.
set -u
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
LABEL="${1:-idle}"
SECONDS_TO_WAIT="${2:-90}"

# Android logs a recorder starting as "rec update" ("rec start" on some versions), and ending as "rec stop".
starts() { "$ADB" shell dumpsys audio | grep -E "rec (start|update|stop) riid" | sed -E 's/ +/ /g'; }

BEFORE="$(starts)"
sleep "$SECONDS_TO_WAIT"
AFTER="$(starts)"

NEW="$(diff <(echo "$BEFORE") <(echo "$AFTER") | grep '^>' || true)"
if [ -z "$NEW" ]; then
  echo "OK   $LABEL: no microphone start in ${SECONDS_TO_WAIT}s with no touch"
else
  echo "FAIL $LABEL: the microphone started with no touch:"
  echo "$NEW"
fi
