#!/usr/bin/env bash
# Is the Night loop's player decoding? CPU of ExoPlayer's playback and MediaCodec threads, on Home,
# behind Echoes, Patterns and You, back on Home, and with the app in the background. Near zero means
# paused. Start on Home at normal motion, Night.
#
#   .maestro/failures/video-pause.sh
set -u
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
PID="$("$ADB" shell pidof host.exp.exponent | tr -d '\r')"
probe() {
  "$ADB" shell "top -H -b -n 2 -d 3 -p $PID -o TID,%CPU,CMD" 2>/dev/null |
    grep -E "ExoPlayer:Playb|MediaCodec_loop" | awk '{print $2}' | tail -2 | tr '\n' ' '
  echo
}
echo -n "Home:           "; probe
"$ADB" shell input tap 422 2228; sleep 8
echo -n "Echoes:         "; probe
"$ADB" shell input tap 652 2228; sleep 8
echo -n "Patterns:       "; probe
"$ADB" shell input tap 880 2228; sleep 8
echo -n "You:            "; probe
"$ADB" shell input tap 190 2228; sleep 8
echo -n "Home again:     "; probe
"$ADB" shell input keyevent KEYCODE_HOME; sleep 8
echo -n "App background: "; probe
