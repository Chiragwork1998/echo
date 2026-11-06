#!/usr/bin/env bash
# Makes the emulator sleep like a phone, for the keep-awake tests, and puts it back.
#
#   .maestro/phone-power.sh on [timeout_ms]   screen_off_timeout defaults to 15000, stay-on-while-plugged off
#   .maestro/phone-power.sh off               restores what `on` found
#   .maestro/phone-power.sh state             what the screen and wake locks are doing now
#
# The emulator comes up with stay_on_while_plugged_in=1 and screen_off_timeout=2147483647, so it never
# sleeps, and a take that a sleeping screen would end appears to work. With this on, every test that
# waits more than the timeout without a touch lets the screen sleep, so use it only around the tests
# that mean it, and always run `off` afterwards.
set -u
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
SAVED="${E2E_OUT:-/tmp/echo-e2e}/phone-power.saved"
mkdir -p "$(dirname "$SAVED")"

case "${1:-state}" in
  on)
    if [ ! -f "$SAVED" ]; then
      {
        echo "stay_on_while_plugged_in=$("$ADB" shell settings get global stay_on_while_plugged_in | tr -d '\r')"
        echo "screen_off_timeout=$("$ADB" shell settings get system screen_off_timeout | tr -d '\r')"
      } >"$SAVED"
    fi
    "$ADB" shell settings put global stay_on_while_plugged_in 0
    "$ADB" shell settings put system screen_off_timeout "${2:-15000}"
    echo "phone power on (saved originals in $SAVED)"
    cat "$SAVED"
    ;;
  off)
    if [ -f "$SAVED" ]; then
      # shellcheck disable=SC1090
      . "$SAVED"
      "$ADB" shell settings put global stay_on_while_plugged_in "$stay_on_while_plugged_in"
      "$ADB" shell settings put system screen_off_timeout "$screen_off_timeout"
      rm -f "$SAVED"
      "$ADB" shell input keyevent KEYCODE_WAKEUP
      echo "restored: stay_on_while_plugged_in=$stay_on_while_plugged_in screen_off_timeout=$screen_off_timeout"
    else
      echo "nothing saved: already restored"
    fi
    ;;
  state)
    echo "wakefulness: $("$ADB" shell dumpsys power | grep -m1 -oE 'mWakefulness=[A-Za-z]+')"
    echo "display on: $("$ADB" shell dumpsys power | grep -m1 -oE 'Display Power: state=[A-Z]+')"
    echo "wake locks held:"
    "$ADB" shell dumpsys power | grep -E "^\s+(PARTIAL|FULL|SCREEN_BRIGHT|SCREEN_DIM)_WAKE_LOCK|SCREEN_BRIGHT_WAKE_LOCK|WakeLock" | grep -v "^Wake Locks" | head -12
    ;;
esac
