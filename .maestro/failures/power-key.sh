#!/usr/bin/env bash
# The power button, pressed mid-take, or mid-send, and what the person finds when they unlock.
#
#   .maestro/failures/power-key.sh take|send [shots_dir]
#
#   take   a take is running: press power, wait, unlock, and look at the session
#   send   Stop has been pressed, the words are on their way: press power at once, unlock, look
#
# Start on Home, voice and live words already agreed, no draft. Show words decides hidden or live:
# turn it on in the app for a live take. Reads the audio ledger afterwards through what ECHO offers,
# since the app's files are not readable from adb.
set -u
WHEN="${1:-take}"
SHOTS="${2:-/tmp/echo-e2e/power-key-$WHEN}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
tap() { "$ADB" shell input tap "$1" "$2"; }
awake() { "$ADB" shell dumpsys power | grep -m1 -oE 'mWakefulness=[A-Za-z]+'; }
unlock() { "$ADB" shell input keyevent KEYCODE_WAKEUP; sleep 2; "$ADB" shell wm dismiss-keyguard; sleep 3; }

"$ADB" shell settings put global transition_animation_scale 0
tap 540 1000   # Begin
sleep 50
tap 540 900    # the open sky starts the take
sleep 12
shot 1-recording
if [ "$WHEN" = send ]; then
  tap 535 2096 # Stop: the words are now on their way
  sleep 1
fi
"$ADB" shell input keyevent KEYCODE_POWER
echo "power pressed: $(awake)"
sleep 20
echo "20 s later: $(awake)"
"$ADB" shell dumpsys audio | grep -E "rec (start|update|stop) riid" | tail -3 | cut -c1-110
unlock
shot 2-after-unlock
sleep 40
shot 3-after-40s
