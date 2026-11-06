#!/usr/bin/env bash
# Force-stop ECHO in the middle of a SECOND take, after the first has become words, and check that the
# first take's words are still on the page afterwards (git: fix(journal) a take cut off after ...).
# adb taps for the same reason as kill-take.sh. Starts on Home with a draft whose words are in, and
# Show words on, so the second take is live.
#
#   .maestro/failures/kill-second-take.sh [shots_dir]
set -u
SHOTS="${1:-/tmp/echo-e2e/kill-second-take}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }

"$ADB" shell settings put global transition_animation_scale 0
tap 540 1000   # Begin: resumes the draft, whose words are on the page
sleep 50
shot 1-before
tap 540 900    # a second take, live
sleep 25
shot 2-second-take
"$ADB" shell am force-stop host.exp.exponent
echo "force-stopped mid-take"
"$HERE/launch.sh" kill
tap 540 1000
sleep 50
shot 3-after
