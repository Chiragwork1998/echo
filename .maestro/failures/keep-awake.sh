#!/usr/bin/env bash
# Does the screen stay awake through a take with no touch? Starts a take on the open sky (one tap),
# touches nothing, and records the screen's state and the wake locks every 5 seconds, then wakes the
# phone and photographs what the person finds.
#
#   .maestro/failures/keep-awake.sh <seconds> [shots_dir]
#
# Start with the daily session open in Speak, on the screen you mean to test (words shown for a live
# take, hidden for a hidden one), and `.maestro/phone-power.sh on` already run. The screen timeout is
# set to 15 s only after the session is open, since reaching it takes longer than that.
# Expo Go in development holds the screen on by itself; the E2E stand-in lets that go (see
# src/testing/e2e/expoAudio.ts), so run Metro with ECHO_E2E=1.
set -u
SECONDS_TO_WATCH="${1:-40}"
SHOTS="${2:-/tmp/echo-e2e/keep-awake}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$SHOTS"
shot() { "$ADB" exec-out screencap -p >"$SHOTS/$1.png"; echo "shot $SHOTS/$1.png"; }
state() {
  local awake locks
  awake="$("$ADB" shell dumpsys power | grep -m1 -oE 'mWakefulness=[A-Za-z]+')"
  locks="$("$ADB" shell dumpsys power | grep -cE "SCREEN_BRIGHT_WAKE_LOCK|FULL_WAKE_LOCK")"
  echo "t=$1s $awake screen-wake-locks=$locks"
}

"$ADB" shell settings put system screen_off_timeout 15000
# A touch on a dozing screen only wakes it, so wake it first: that also starts the 15 s count.
"$ADB" shell input keyevent KEYCODE_WAKEUP
"$ADB" shell wm dismiss-keyguard
sleep 2
shot 0-before-take
# The open sky starts the take, and that touch is the last one. NO_TAP=1 when a take is already running.
if [ -z "${NO_TAP:-}" ]; then "$ADB" shell input tap 540 900; fi
START=$(date +%s)
state 0
while [ $(( $(date +%s) - START )) -lt "$SECONDS_TO_WATCH" ]; do
  sleep 5
  state $(( $(date +%s) - START ))
done
echo "-- wake locks while the take is still running:"
"$ADB" shell dumpsys power | grep -E "SCREEN_BRIGHT_WAKE_LOCK|Wake Locks:" | head -3
"$ADB" shell input keyevent KEYCODE_WAKEUP
"$ADB" shell wm dismiss-keyguard
sleep 6
shot after
"$HERE/phone-power.sh" state | head -2

# STOP_AFTER=1: the person stops the take (a touch), and the words follow. The screen should stay on
# while they are sent and go back to sleeping normally once they are in, so watch it for a minute with
# no further touch.
if [ -n "${STOP_AFTER:-}" ]; then
  "$ADB" shell input tap 540 900
  STOPPED=$(date +%s)
  echo "-- stopped; watching the words arrive:"
  while [ $(( $(date +%s) - STOPPED )) -lt "${AFTER_SECONDS:-75}" ]; do
    state $(( $(date +%s) - STOPPED ))
    sleep 5
  done
  "$ADB" shell input keyevent KEYCODE_WAKEUP
  sleep 3
  shot words
fi
