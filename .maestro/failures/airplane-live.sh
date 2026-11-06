#!/usr/bin/env bash
# Airplane mode in the middle of a live take: the recording must carry on, the person is told calmly,
# and the words arrive after Stop from the recording once there is a network again.
#
#   .maestro/failures/airplane-live.sh [shots_dir]
#
# Start on Home, voice and live words agreed, Show words ON, no draft. adb taps and screenshots.
# Screenshots: 1 words streaming, 2 airplane on (the calm note), 3 airplane off and still recording,
# 4 after Stop, 5 the words.
set -u
SHOTS="${1:-/tmp/echo-e2e/airplane-live}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }

"$ADB" shell settings put global transition_animation_scale 0
tap 540 1000   # Begin
sleep 50
tap 540 900    # the open sky starts a live take
sleep 14
shot 1-streaming
"$HERE/airplane.sh" on
sleep 15
shot 2-airplane-on
"$HERE/airplane.sh" off
sleep 10
shot 3-airplane-off
tap 535 2096   # Stop
sleep 45
shot 4-after-stop
tap 540 2210   # Show words / Hide words, in case they are hidden
sleep 5
shot 5-words
