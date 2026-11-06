#!/usr/bin/env bash
# Records the screen through Home, Begin and the session, for a frame-by-frame look at the living
# background: does Begin restart, freeze or flash the video, and does the 12 second loop seam pop?
#
#   .maestro/failures/video-record.sh [seconds] [out_dir]
#
# Start on Home at normal motion (not Reduce Motion), Night. Writes <out>/begin.mp4 and then per-frame
# difference and brightness (ffmpeg signalstats) to <out>/diff.txt and <out>/luma.txt. A pop is a spike
# in diff.txt, a freeze is a run of zeros, a flash is a spike in luma.txt.
set -u
SECS="${1:-50}"
OUT="${2:-/tmp/echo-e2e/video}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"

"$ADB" shell settings put global transition_animation_scale 1.0
"$ADB" shell "screenrecord --size 360x800 --bit-rate 3000000 --time-limit $SECS /sdcard/begin.mp4" &
sleep 14
"$ADB" shell input tap 540 1000   # Begin, 14 s in
wait
"$ADB" pull /sdcard/begin.mp4 "$OUT/begin.mp4" >/dev/null
ffmpeg -y -loglevel error -i "$OUT/begin.mp4" -vf "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=$OUT/diff.txt" -f null -
ffmpeg -y -loglevel error -i "$OUT/begin.mp4" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=$OUT/luma.txt" -f null -
echo "recorded $OUT/begin.mp4"
