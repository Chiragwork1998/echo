#!/usr/bin/env bash
# Runs one Maestro flow against the running emulator.
#
#   .maestro/run.sh 02-daily-voice-hidden.yaml [maestro args...]
#
# Output (screenshots, logs) goes to $E2E_OUT/<flow>, default /tmp/echo-e2e.
#
# A flow whose header has the line `# e2e: reduce-motion` runs with Android's animation scale at 0,
# which is the setting ECHO's Reduce Motion reads. It is needed wherever the screen has the Night
# loop video (Home, the daily session): while the video plays the emulator's accessibility tree
# never returns, so Maestro cannot read the screen at all. Reduce Motion shows the still instead.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
FLOW="$1"
shift
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
export JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$(dirname "$ADB"):$PATH"

OUT="${E2E_OUT:-/tmp/echo-e2e}/$(basename "$FLOW" .yaml)"
rm -rf "$OUT"
mkdir -p "$OUT"

"$ADB" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
"$ADB" shell pkill -9 -f uiautomator >/dev/null 2>&1 || true

if grep -q '^# e2e: reduce-motion' "$HERE/$FLOW"; then
  "$ADB" shell settings put global transition_animation_scale 0
  trap '"$ADB" shell settings put global transition_animation_scale 1.0' EXIT
  sleep 3
else
  "$ADB" shell settings put global transition_animation_scale 1.0
fi

# E2E_LAUNCH=kill|fresh starts ECHO first (the app, not Maestro, must start it: see launch.sh).
# The animation scale is set first, so the app starts with it.
if [ -n "${E2E_LAUNCH:-}" ]; then "$HERE/launch.sh" "$E2E_LAUNCH"; fi

cd "$OUT"
maestro --device "$("$ADB" get-serialno)" test "$@" --debug-output "$OUT/debug" "$HERE/$FLOW"
