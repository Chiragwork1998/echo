#!/usr/bin/env bash
# The screen stays on through a take with no touch, at a 15 s screen timeout, on the release build.
#
#   .maestro/release/keep-awake.sh [out_dir]
#
# Start on the daily session with ECHO's "Record again?" dialog showing (or in a state where the tap at
# 816,1368 starts a take), and the screen timeout long (the original is 2147483647, stay_on 1) so nothing
# sleeps while you set up. The timeout is set to 15 s straight after the last touch, so it is counted
# from that touch. Prints wakefulness and the screen wake lock every 5 s for 40 s, then Stops (the
# control: the screen must time out about 15 s after that). Restore: settings put system
# screen_off_timeout 2147483647; settings put global stay_on_while_plugged_in 1.
set -u
OUT="${1:-/tmp/echo-e2e/v3-keepawake}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"
now() { date +%H:%M:%S; }
awake() { "$ADB" shell dumpsys power | grep -m1 mWakefulness= | tr -d ' \r'; }
locks() { "$ADB" shell dumpsys power | grep -E "SCREEN_BRIGHT|SCREEN_DIM|FULL_WAKE|PARTIAL" | grep -i thesaturn | sed -E 's/^ +//' | cut -c1-150; }
mic() { "$ADB" shell dumpsys audio | grep -E "rec (start|update|stop).*thesaturnlabs" | tail -1 | cut -c1-120; }

"$ADB" shell settings put global stay_on_while_plugged_in 0
"$ADB" shell input tap 816 1368
"$ADB" shell settings put system screen_off_timeout 15000
echo "timeout: $("$ADB" shell settings get system screen_off_timeout), stay_on: $("$ADB" shell settings get global stay_on_while_plugged_in)"
echo "T0 $(now) (last touch: Record again)"
sleep 3
"$ADB" exec-out screencap -p >"$OUT/t03.png"
for t in 5 10 15 20 25 30 35 40; do
  sleep 5
  echo "t=${t}s $(now) $(awake) | $(mic)"
  if [ "$t" = 20 ] || [ "$t" = 40 ]; then
    "$ADB" exec-out screencap -p >"$OUT/t$t.png"
    echo "  locks: $(locks)"
  fi
done
echo "== Stop (the last touch), then the screen should time out"
"$ADB" shell input tap 540 2098
STOP=$(date +%s)
for i in 1 2 3 4 5 6 7 8 9; do
  sleep 3
  echo "after stop +$(( $(date +%s) - STOP ))s $(awake)"
done
echo done
