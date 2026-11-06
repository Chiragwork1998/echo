#!/usr/bin/env bash
# Microphone denied: revoke it, try to speak, see what the person is told and offered. Then deny the
# system prompt, and allow it again from the app's own path.
#
#   .maestro/failures/mic-denied.sh [shots_dir]
#
# adb taps and screenshots, for the same reason as kill-take.sh. Starts on Home with no draft. Android
# kills the app when a runtime permission is revoked, so it is started again after. Screenshots, in
# order: 1 the explanation ECHO gives first, 2 the system prompt, 3 after Don't allow, 4 after
# the person allows it.
set -u
SHOTS="${1:-/tmp/echo-e2e/mic-denied}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }

"$ADB" shell settings put global transition_animation_scale 0
# A clean start: open the session, throw away any draft, come back to Home.
tap 540 1000
sleep 50
tap 110 2209   # Back
sleep 6
tap 704 1368   # Discard (if it asks)
sleep 20
"$ADB" shell pm revoke host.exp.exponent android.permission.RECORD_AUDIO
"$HERE/launch.sh" kill
tap 540 1000   # Begin
sleep 50
tap 540 900    # the open sky: try to speak
sleep 10
shot 1-explanation
tap 540 1250   # Allow microphone: ECHO's own explanation comes first, then the system asks
sleep 10
shot 2-system-prompt
tap 540 1519   # Don't allow (the system dialog: While using the app 1206, Only this time 1363, Don't allow 1519)
sleep 8
shot 3-after-deny
"$ADB" shell pm grant host.exp.exponent android.permission.RECORD_AUDIO
tap 540 900
sleep 10
shot 4-after-allowed
