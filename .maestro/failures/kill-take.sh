#!/usr/bin/env bash
# Force-stop ECHO in the middle of a spoken take, start it again, and see what the person is offered.
# Driven by adb taps rather than Maestro, because on a loaded host Maestro's view-hierarchy read of
# Home takes minutes (see all.sh). Coordinates are for the 1080x2400 emulator.
#
#   .maestro/failures/kill-take.sh hidden|live [shots_dir]
#
# Starts on Home with no draft. `live` turns Show words on first (so the take streams), so voice
# consent and the live note must already have been accepted.
set -u
MODE="${1:-hidden}"
SHOTS="${2:-/tmp/echo-e2e/kill-take-$MODE}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }

"$ADB" shell settings put global transition_animation_scale 0
tap 540 1000   # Begin
sleep 50
if [ "$MODE" = live ]; then
  tap 540 2210 # Show words
  sleep 6
fi
tap 540 900    # the open sky starts the take
sleep 12
shot 1-recording
"$ADB" shell am force-stop host.exp.exponent
echo "force-stopped mid-take"
"$HERE/launch.sh" kill
tap 540 1000   # Begin: the resumed draft
sleep 50
shot 2-offered
