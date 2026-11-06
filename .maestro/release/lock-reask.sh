#!/usr/bin/env bash
# With the lock on, 40 s in the background (more than the 30 s grace), return, and poll which window has
# focus every 2 s: the system's credential prompt can take about 4 to 6 s to appear on the emulator, so
# a single look after 5 s can wrongly read as "no lock". Then the device PIN is typed.
#
#   .maestro/release/lock-reask.sh [out_dir] [pin]
#
# Start with the lock on and ECHO open, and the PIN set (`adb shell locksettings set-pin 1234`).
set -u
OUT="${1:-/tmp/echo-e2e/v3-lock}"
PIN="${2:-1234}"
PKG=com.thesaturnlabs.echo
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"
focus() { "$ADB" shell dumpsys window | grep -m1 mCurrentFocus | sed -E 's/.*u0 //; s/\}//'; }
echo "start focus: $(focus)"
"$ADB" shell input keyevent KEYCODE_HOME
sleep 40
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1
for i in 1 2 3 4 5 6 7 8; do
  sleep 2
  echo "t=$((i * 2))s focus: $(focus)"
done
"$ADB" exec-out screencap -p >"$OUT/return-40s.png"
"$ADB" shell input text "$PIN"
"$ADB" shell input keyevent KEYCODE_ENTER
sleep 6
echo "after PIN: $(focus)"
echo done
