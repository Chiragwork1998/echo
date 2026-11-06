#!/usr/bin/env bash
# The Night loop on Home in the release build: is the player decoding, does it hold audio focus, and
# does an idle Home let the screen sleep at a phone's 15 s timeout with no screen wake lock.
#
#   .maestro/release/idle-home.sh [package]
#
# Start on Home at normal motion, Night, with no take running. Leaves phone-power on: run
# `.maestro/phone-power.sh off` when the walk is done.
set -u
PKG="${1:-com.thesaturnlabs.echo}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
PID="$("$ADB" shell pidof "$PKG" | tr -d '\r')"
echo "pid=$PID"
echo -n "player CPU on Home (playback and decoder threads): "
"$ADB" shell "top -H -b -n 2 -d 3 -p $PID -o TID,%CPU,CMD" 2>/dev/null |
  grep -E "ExoPlayer:Playb|MediaCodec_loop" | awk '{print $2}' | tail -2 | tr '\n' ' '
echo
echo "audio focus stack:"
"$ADB" shell dumpsys audio | grep -A3 "Audio Focus stack" | head -4
"$HERE/phone-power.sh" on 15000
"$ADB" shell input keyevent KEYCODE_WAKEUP
sleep 2
for i in 0 1 2 3 4 5; do
  echo "idle Home t=$((i * 5))s: $("$HERE/phone-power.sh" state | head -1) screen-wake-locks=$("$ADB" shell dumpsys power | grep -cE 'SCREEN_BRIGHT_WAKE_LOCK|FULL_WAKE_LOCK')"
  sleep 5
done
