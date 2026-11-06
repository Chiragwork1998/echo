#!/usr/bin/env bash
# Cold start of the installed release build, recorded, with the time to first screen.
#
#   .maestro/release/cold-start.sh <out_dir> [package]
#
# Force-stops the app, goes to the launcher, records the screen while `am start -W` launches the
# activity, then reports the launch time Android measured and the brightness of every recorded frame
# (a white flash is a frame far brighter than the splash and the first screen).
set -u
OUT="${1:-/tmp/echo-e2e/release-cold}"
PKG="${2:-com.thesaturnlabs.echo}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"

"$ADB" shell am force-stop "$PKG"
"$ADB" shell input keyevent KEYCODE_HOME
sleep 3
"$ADB" shell "screenrecord --size 360x800 --bit-rate 4000000 --time-limit 14 /sdcard/cold.mp4" &
sleep 1
START=$(date +%s.%N)
"$ADB" shell am start -W -n "$PKG/.MainActivity" | tr -d '\r' | grep -E "ThisTime|TotalTime|WaitTime" | tee "$OUT/am-start.txt"
wait
"$ADB" pull /sdcard/cold.mp4 "$OUT/cold.mp4" >/dev/null
ffmpeg -y -loglevel error -i "$OUT/cold.mp4" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=$OUT/luma.txt" -f null - 2>/dev/null
ffmpeg -y -loglevel error -i "$OUT/cold.mp4" -vf "fps=2,scale=180:-1,tile=7x2" -frames:v 1 "$OUT/sheet.png" 2>/dev/null
echo "recorded $OUT (sheet.png, luma.txt)"
