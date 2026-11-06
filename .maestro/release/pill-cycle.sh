#!/usr/bin/env bash
# Day and Night changed back and forth on the release build: a full screenshot after each change, the
# Night "Write instead" pill and the Day "Write instead" link cropped from it, and a sheet of each.
#
#   .maestro/release/pill-cycle.sh [out_dir]
#
# Start on the You page at the top, motion on. Three changes with motion, two with Reduce Motion on
# from the start, and one with Reduce Motion switched on between the tap and the page appearing (how the
# clipped label was first seen). Taps are for a 1080x2400 screen. Needs ffmpeg.
#
# Allow for the emulator: for several seconds after Reduce Motion is switched, Home skips frames and a
# tap can be late or lost. A sample taken in that window shows the old appearance, not a wrong label.
set -u
OUT="${1:-/tmp/echo-e2e/v3-pill}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
FF="$(command -v ffmpeg || echo /opt/homebrew/bin/ffmpeg)"
mkdir -p "$OUT"
tap() { "$ADB" shell input tap "$1" "$2"; }
scale() { "$ADB" shell settings put global transition_animation_scale "$1"; }
snap() {
  "$ADB" exec-out screencap -p >"$OUT/$1.png"
  "$FF" -hide_banner -loglevel error -y -i "$OUT/$1.png" -vf "crop=520:150:280:1207" "$OUT/$1-pill.png"
  "$FF" -hide_banner -loglevel error -y -i "$OUT/$1.png" -vf "crop=520:110:280:1575" "$OUT/$1-link.png"
  echo "shot $1"
}
# change <y of the Day or Night row> <name> <motion: on|off|during>
change() {
  tap 881 2208; sleep 3
  tap 540 "$1"; sleep 3
  if [ "$3" = during ]; then scale 0; sleep 3; fi
  tap 190 2228; sleep 7
  snap "$2"
}

scale 1.0
for i in 1 2 3; do
  change 420 "c$i-day-motion" on
  change 558 "c$i-night-motion" on
done
scale 0
sleep 10
for i in 4 5; do
  change 420 "c$i-day-rm" off
  change 558 "c$i-night-rm" off
done
scale 1.0
sleep 10
tap 881 2208; sleep 3
tap 540 420; sleep 3; scale 0; sleep 3; tap 190 2228; sleep 7; snap c6-day-rm-during
tap 881 2208; sleep 3
scale 1.0
tap 540 558; sleep 3; scale 0; sleep 3; tap 190 2228; sleep 7; snap c6-night-rm-during
scale 1.0

cd "$OUT" || exit 1
night=""; day=""
for n in c1-night-motion c2-night-motion c3-night-motion c4-night-rm c5-night-rm c6-night-rm-during; do night="$night -i $n-pill.png"; done
for n in c1-day-motion c2-day-motion c3-day-motion c4-day-rm c5-day-rm c6-day-rm-during; do day="$day -i $n-link.png"; done
"$FF" -hide_banner -loglevel error -y $night -filter_complex "vstack=inputs=6" night-sheet.png
"$FF" -hide_banner -loglevel error -y $day -filter_complex "vstack=inputs=6" day-sheet.png
echo "sheets: $OUT/night-sheet.png $OUT/day-sheet.png"
