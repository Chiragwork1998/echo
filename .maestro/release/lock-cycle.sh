#!/usr/bin/env bash
# The biometric lock on the release build, with a device PIN (the emulator has no fingerprint).
#
#   .maestro/release/lock-cycle.sh [out_dir]
#
# Start on the You page at the top with the lock off and `adb shell locksettings set-pin 1234` done.
# Screenshots of a locked window are black (FLAG_SECURE), so what is proved is read from the window
# manager: which window has focus, and whether the system's credential prompt is up.
set -u
OUT="${1:-/tmp/echo-e2e/release-lock}"
PKG=com.thesaturnlabs.echo
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
mkdir -p "$OUT"
shot() { "$ADB" exec-out screencap -p >"$OUT/$1.png"; }
focus() { "$ADB" shell dumpsys window | grep -m1 mCurrentFocus | sed -E 's/.*u0 //; s/\}//'; }
secure() { "$ADB" shell dumpsys window windows | grep -A30 "Window #.*$PKG/$PKG.MainActivity" | grep -ciE "FLAG_SECURE|isSecure=true|SECURE"; }
pin() { "$ADB" shell input text 1234; "$ADB" shell input keyevent KEYCODE_ENTER; sleep 6; }

echo "== turn the lock on (the system asks for the PIN)"
"$ADB" shell input tap 900 1385
sleep 6
echo "focus: $(focus)"
pin
echo "focus after PIN: $(focus)"
shot 1-lock-on

echo "== background, app switcher, return within 30 s: no lock"
"$ADB" shell input keyevent KEYCODE_HOME
sleep 3
"$ADB" shell input keyevent KEYCODE_APP_SWITCH
sleep 4
shot 2-app-switcher
"$ADB" shell input keyevent KEYCODE_HOME
sleep 4
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null
sleep 6
echo "focus after a quick return: $(focus)"

echo "== background 45 s, return: the lock asks"
"$ADB" shell input keyevent KEYCODE_HOME
sleep 45
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null
sleep 5
echo "focus on return after 45 s: $(focus)"
shot 3-return-45s
pin
echo "focus after PIN: $(focus)"

echo "== cold start: the prompt shows before any content"
"$ADB" shell am force-stop "$PKG"
sleep 2
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null
for i in 1 2 3 4 5 6 7 8; do
  sleep 2
  echo "cold t=$((i * 2))s focus: $(focus)"
done
shot 4-cold-start
pin
echo "focus after PIN: $(focus)"
