#!/usr/bin/env bash
# Journey 8 on the release build, with motion on: Write instead, the keyboard lifts the book just far
# enough (D-010) and it settles back, a long entry turns pages, and the words survive a force-stop.
#
#   .maestro/release/write-path.sh [out_dir]
#
# Start on Home with no draft. adb taps and screenshots: Maestro cannot read Home while the loop plays.
set -u
OUT="${1:-/tmp/echo-e2e/release-write}"
PKG=com.thesaturnlabs.echo
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"
shot() { "$ADB" exec-out screencap -p >"$OUT/$1.png"; echo "shot $OUT/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }
type_text() { "$ADB" shell input text "$1"; }

"$ADB" shell settings put global transition_animation_scale 1.0
"$ADB" shell "screenrecord --size 360x800 --bit-rate 4000000 --time-limit 90 /sdcard/write.mp4" &
sleep 1
tap 540 1282   # Write instead
sleep 14
shot 1-rest
tap 540 1000   # the page: the keyboard comes
sleep 5
shot 2-keyboard-up
type_text "A%squiet%sline%swritten%sby%shand.%sThe%swindow%swas%sopen%sand%sthe%sstreet%sbelow%swent%son%swith%sits%ssmall%snoises.%sA%sbicycle%sbell,%sa%sdoor,%ssomeone%scalling%sa%sname%sthat%swas%snot%smine.%sI%sthought%sabout%sthe%sweek%sand%show%smuch%sof%sit%sI%shad%sspent%swaiting%sfor%sa%smoment%sthat%swould%sannounce%sitself.%sIt%sdid%snot%scome."
sleep 3
type_text "%sWhat%scame%sinstead%swas%sthis%sordinary%sevening,%sand%sthe%splain%sfact%sthat%sI%swas%sin%sit.%sI%smade%stea%sand%slet%sit%sgo%scold.%sI%swatched%sthe%slight%smove%sacross%sthe%swall%suntil%sit%swas%sgone."
sleep 3
type_text "%sThe%sneighbours%slit%stheir%slamps%sone%sby%sone,%sand%sI%ssat%sthere%slistening%sto%sthe%skettle%stick%sas%sit%scooled,%sto%sthe%spipes,%sto%sthe%sfar%shum%sof%sthe%sroad,%suntil%sthe%shouse%sitself%sseemed%sto%sbreathe."
sleep 4
shot 3-long-keyboard-up
tap 113 2338   # hide the keyboard
sleep 5
shot 4-keyboard-down
sleep 70
"$ADB" pull /sdcard/write.mp4 "$OUT/write.mp4" >/dev/null 2>&1
ffmpeg -y -loglevel error -i "$OUT/write.mp4" -vf "fps=1,scale=180:-1,tile=10x6" -frames:v 1 "$OUT/sheet.png" 2>/dev/null
echo "recorded $OUT/write.mp4"
