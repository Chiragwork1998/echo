#!/usr/bin/env bash
# Day, Night and Reduce Motion on the release build: the player CPU on Home in each, and a screenshot.
#
#   .maestro/release/appearance.sh [out_dir]
#
# Start on the You page at the top. Ends on Night with motion on. adb taps, 1080x2400.
set -u
OUT="${1:-/tmp/echo-e2e/release-appearance}"
PKG=com.thesaturnlabs.echo
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"
shot() { "$ADB" exec-out screencap -p >"$OUT/$1.png"; echo "shot $OUT/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }
PID="$("$ADB" shell pidof "$PKG" | tr -d '\r')"
cpu() {
  "$ADB" shell "top -H -b -n 2 -d 3 -p $PID -o TID,%CPU,CMD" 2>/dev/null |
    grep -E "ExoPlayer:Playb|MediaCodec_loop" | awk '{print $2}' | tail -2 | tr '\n' ' '
  echo
}

echo "== Day (motion on)"
"$ADB" shell settings put global transition_animation_scale 1.0
tap 540 420; sleep 4
tap 190 2228; sleep 10
shot day-home
echo -n "player CPU on Day Home: "; cpu

echo "== Night, Reduce Motion on"
tap 880 2228; sleep 5
tap 540 528; sleep 4
"$ADB" shell settings put global transition_animation_scale 0
sleep 4
tap 190 2228; sleep 10
shot night-reduce-motion
echo -n "player CPU on Night Home with Reduce Motion: "; cpu
PID2="$("$ADB" shell pidof "$PKG" | tr -d '\r')"; echo "process alive: $PID2"

echo "== Night, motion on again"
"$ADB" shell settings put global transition_animation_scale 1.0
sleep 8
shot night-motion
echo -n "player CPU on Night Home, motion back on: "; cpu
