#!/usr/bin/env bash
# Hardware Back at each stage of the daily session on the release build, with a screenshot of what
# the person sees after each.
#
#   .maestro/release/back-stages.sh [out_dir]
#
# Start on Home with a draft, voice allowed. adb taps (Home and the session cannot be read by Maestro
# while the loop plays). Screen is 1080x2400.
set -u
OUT="${1:-/tmp/echo-e2e/release-back}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"
shot() { "$ADB" exec-out screencap -p >"$OUT/$1.png"; echo "shot $OUT/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }
back() { "$ADB" shell input keyevent 4; }
rec_events() { "$ADB" shell dumpsys audio | grep -E "rec (update|stop) riid" | tail -2 | cut -c1-90; }

"$ADB" shell settings put global transition_animation_scale 1.0

echo "== clear the draft first"
tap 540 1000; sleep 22; back; sleep 3; tap 704 1368; sleep 15; shot 0-clean-home

echo "== S1: Back during the stillness, 2 s after Begin"
tap 540 1000; sleep 2; back; sleep 5; shot s1-during-stillness

echo "== S2: Back with the book open and nothing to keep"
tap 540 1000; sleep 22; shot s2a-book-open; back; sleep 5; shot s2b-after-back

echo "== S3: Back mid-take: Stay, then Back and Discard"
tap 540 1000; sleep 22; tap 540 900; sleep 8; shot s3a-recording
back; sleep 3; shot s3b-dialog
tap 894 1368; sleep 3; shot s3c-after-stay      # Stay: the take must still be running
rec_events
back; sleep 3; tap 704 1368; sleep 10; shot s3d-after-discard
rec_events
