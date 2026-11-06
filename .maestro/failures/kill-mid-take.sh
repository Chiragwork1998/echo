#!/usr/bin/env bash
# Force-stops ECHO while a take is running, then starts it again cold.
#
#   .maestro/failures/kill-mid-take.sh [seconds_before_kill]
#
# Run `.maestro/run.sh failures/start-take.yaml` first, so a take is running. For a live take, turn on
# Show words in the app before that (flow 04 does).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
sleep "${1:-6}"
"$ADB" shell am force-stop host.exp.exponent
echo "force-stopped"
"$HERE/launch.sh" kill
