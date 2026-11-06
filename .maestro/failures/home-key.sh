#!/usr/bin/env bash
# The Home key, pressed mid-take and during the send, and what the person finds on return.
#
#   .maestro/failures/home-key.sh [shots_dir]
#
# Start on Home, voice agreed, Show words OFF (a hidden take), no draft. adb taps and screenshots.
# Screenshots: 1 recording, 2 back after the Home key mid-take, 3 recording again (second take),
# 4 back after the Home key right after Stop (the words were being sent), 5 the page.
set -u
SHOTS="${1:-/tmp/echo-e2e/home-key}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }
back_to_app() { "$ADB" shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 >/dev/null; sleep 12; }

"$ADB" shell settings put global transition_animation_scale 0
tap 540 1000   # Begin
sleep 50
tap 540 900    # the open sky starts the take
sleep 12
shot 1-recording
"$ADB" shell input keyevent KEYCODE_HOME
sleep 15
back_to_app
shot 2-back-mid-take
tap 540 1215   # Turn my voice into words (the take was sealed when the app left the foreground)
sleep 2
"$ADB" shell input keyevent KEYCODE_HOME   # while the send is in flight
sleep 30
back_to_app
shot 3-back-during-send
tap 540 2210   # Show words
sleep 6
shot 4-words
